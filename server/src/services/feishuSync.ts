/**
 * Feishu → Dashboard one-way sync.
 *
 * Source of truth is the Feishu bitable "到店排期" (visit schedule) maintained by the
 * ig-dm-system pipeline (Unipile IG DMs + Gmail → AI status). This module pulls the
 * DOWNSTREAM (confirmed) rows only and upserts them into the dashboard's SQLite so the
 * dashboard can act as the visual command-center / reporting layer.
 *
 * Direction is strictly one-way (Feishu → dashboard). Never write back to Feishu here.
 */
import db from '../db';
import { v4 as uuidv4 } from 'uuid';

const BASE = 'https://open.feishu.cn';

// All Feishu identifiers come from env — no org-specific defaults in source (public repo).
// Set these in .env (see .env.example): the bot's app id/secret and which base+table to mirror.
const APP_ID = process.env.FEISHU_APP_ID || '';
const APP_SECRET = process.env.FEISHU_APP_SECRET || '';
const BITABLE = process.env.FEISHU_BITABLE_APP_TOKEN || '';
const VISITS_TABLE = process.env.FEISHU_VISITS_TABLE_ID || '';

// Feishu 状态 → dashboard pipeline.stage. Only these statuses are downstream enough to
// belong on the command-center kanban; everything else stays in Feishu's top-of-funnel.
const STAGE_MAP: Record<string, string> = {
  已敲定待约时间: 'confirmed',
  已排期: 'scheduled',
  已到店: 'creating_video',
  已发布: 'published',
};

// Feishu 状态 → simplified funnel bucket for the Overview page. Covers the FULL funnel
// (every row, not just downstream) — this is what the user actually watches when away
// from Feishu: who was contacted, who replied, who's scheduled / visited / posted.
const BUCKET_MAP: Record<string, string> = {
  已发未回复: 'no_reply',     // sent, no reply
  等博主回: 'talking',        // replied, waiting on influencer
  等我们回: 'talking',        // replied, waiting on us
  已敲定待约时间: 'talking',   // agreed, time not set yet
  已排期: 'scheduled',        // time scheduled
  已到店: 'visited',          // showed up
  '待发 reel': 'visited',     // showed up, reel pending
  待发帖: 'visited',
  已发布: 'published',        // posted
  婉拒告吹: 'declined',
  取消: 'declined',
};
// Display order + zh labels for the funnel (declined shown separately/muted).
export const FUNNEL_ORDER = ['no_reply', 'talking', 'scheduled', 'visited', 'published'] as const;
export const FUNNEL_LABELS: Record<string, string> = {
  no_reply: '等对方回', talking: '沟通中', scheduled: '已约时间',
  visited: '已到店', published: '已发布', declined: '婉拒', unknown: '待定',
};

type FeishuRecord = { record_id: string; fields: Record<string, any>; last_modified_time?: number };

async function tenantToken(): Promise<string> {
  if (!APP_SECRET) throw new Error('FEISHU_APP_SECRET is not set (see .env / ~/Desktop/.env.secrets)');
  const r = await fetch(`${BASE}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  });
  const d: any = await r.json();
  if (d.code !== 0) throw new Error(`tenant token failed: ${JSON.stringify(d)}`);
  return d.tenant_access_token;
}

async function listRecords(token: string, table: string): Promise<FeishuRecord[]> {
  const out: FeishuRecord[] = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({ page_size: '500', automatic_fields: 'true' }); // need last_modified_time
    if (pageToken) q.set('page_token', pageToken);
    const url = `${BASE}/open-apis/bitable/v1/apps/${BITABLE}/tables/${table}/records?${q}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const d: any = await r.json();
    if (d.code !== 0) throw new Error(`read table failed ${table}: ${JSON.stringify(d)}`);
    out.push(...(d.data?.items || []));
    pageToken = d.data?.has_more ? d.data.page_token : undefined;
  } while (pageToken);
  return out;
}

/** Flatten a bitable cell (string | [{text}] | link-field [{text_arr}] | option {name}) to plain text. */
function cellText(v: any): string {
  if (v == null) return '';
  if (Array.isArray(v)) {
    return v
      .map((x) => {
        if (x && typeof x === 'object') {
          if (Array.isArray(x.text_arr)) return x.text_arr.join('');
          return x.text || x.name || '';
        }
        return String(x);
      })
      .join('');
  }
  if (typeof v === 'object') return v.text || v.name || '';
  return String(v);
}

/** "@handle https://www.instagram.com/..." → { username, url } */
function parseIgLink(raw: string): { username: string; url: string } {
  const text = cellText(raw).trim();
  const handle = (text.match(/@[\w.]+/)?.[0] || '').replace(/^@/, '');
  const url = text.match(/https?:\/\/\S+/)?.[0] || '';
  return { username: handle, url };
}

function parseMoney(raw: string): number {
  const n = parseFloat(cellText(raw).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Pick a date-like substring (YYYY-MM-DD) from a Feishu datetime cell. */
function parseDate(raw: string): string | null {
  return cellText(raw).match(/\d{4}-\d{2}-\d{2}/)?.[0] || null;
}

function ensureChatIdColumn() {
  const cols = db.prepare(`PRAGMA table_info(influencers)`).all() as any[];
  if (!cols.some((c) => c.name === 'feishu_chat_id')) {
    db.exec(`ALTER TABLE influencers ADD COLUMN feishu_chat_id TEXT`);
  }
}

function ensureTeamMember(): string {
  const existing = db.prepare(`SELECT id FROM team_members ORDER BY created_at ASC LIMIT 1`).get() as any;
  if (existing) return existing.id;
  const id = uuidv4();
  db.prepare(`INSERT INTO team_members (id, name, email) VALUES (?, ?, ?)`).run(
    id, 'Feishu Sync', 'feishu-sync@local'
  );
  return id;
}

/** Upsert a campaign per restaurant; returns its id. */
function upsertCampaign(name: string, cache: Map<string, string>): string {
  if (cache.has(name)) return cache.get(name)!;
  const row = db.prepare(`SELECT id FROM campaigns WHERE name = ?`).get(name) as any;
  if (row) {
    cache.set(name, row.id);
    return row.id;
  }
  const id = uuidv4();
  db.prepare(`INSERT INTO campaigns (id, name, status) VALUES (?, ?, 'active')`).run(id, name);
  cache.set(name, id);
  return id;
}

/**
 * Flat mirror table for the Overview funnel — one row per Feishu conversation, the WHOLE
 * funnel (not just downstream). Decoupled from the bloated CRM tables so the simple
 * Overview page reads exactly what the user watches.
 */
function ensureFunnelTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ig_funnel (
      chat_id TEXT PRIMARY KEY,
      channel TEXT DEFAULT 'instagram',
      name TEXT,
      handle TEXT,
      restaurant TEXT,
      status_raw TEXT,
      bucket TEXT,
      note TEXT,
      visit_date TEXT,
      visit_time TEXT,
      pub_date TEXT,
      post_url TEXT,
      scheduled_message TEXT,
      last_modified TEXT,
      paid INTEGER DEFAULT 0,
      amount REAL DEFAULT 0,
      updated_at TEXT
    )
  `);
  // migrate older mirrors that predate these columns
  const cols = (db.prepare(`PRAGMA table_info(ig_funnel)`).all() as any[]).map((c) => c.name);
  if (!cols.includes('scheduled_message')) db.exec(`ALTER TABLE ig_funnel ADD COLUMN scheduled_message TEXT`);
  if (!cols.includes('visit_time')) db.exec(`ALTER TABLE ig_funnel ADD COLUMN visit_time TEXT`);
  if (!cols.includes('last_modified')) db.exec(`ALTER TABLE ig_funnel ADD COLUMN last_modified TEXT`);
}

export type SyncResult = {
  scanned: number;
  imported: number;
  skipped: number;
  removed: number;
  funnel: Record<string, number>;
  byStage: Record<string, number>;
  campaigns: string[];
};

/**
 * Reconcile: drop Feishu-sourced rows that are no longer downstream (e.g. a влог that
 * regressed to 婉拒告吹/取消, or was deleted upstream). Only touches rows that carry a
 * feishu_chat_id — manually-added influencers (chat_id NULL) are never deleted. This is
 * what makes the dashboard a FAITHFUL one-way mirror instead of an append-only pile.
 */
function reconcile(seenChatIds: Set<string>): number {
  const stale = db
    .prepare(`SELECT id, feishu_chat_id FROM influencers WHERE feishu_chat_id IS NOT NULL`)
    .all() as any[];
  let removed = 0;
  for (const row of stale) {
    if (seenChatIds.has(row.feishu_chat_id)) continue;
    db.prepare(`DELETE FROM pipeline WHERE influencer_id = ?`).run(row.id);
    db.prepare(`DELETE FROM content_schedule WHERE influencer_id = ?`).run(row.id);
    db.prepare(`DELETE FROM payments WHERE influencer_id = ?`).run(row.id);
    db.prepare(`DELETE FROM long_term_partners WHERE influencer_id = ?`).run(row.id);
    db.prepare(`DELETE FROM outreach WHERE influencer_id = ?`).run(row.id);
    db.prepare(`DELETE FROM influencers WHERE id = ?`).run(row.id);
    removed++;
  }
  return removed;
}

export function syncFromRecords(records: FeishuRecord[]): SyncResult {
  ensureChatIdColumn();
  ensureFunnelTable();
  const teamMemberId = ensureTeamMember();
  const campaignCache = new Map<string, string>();
  const byStage: Record<string, number> = {};
  const funnelCounts: Record<string, number> = {};
  const seenChatIds = new Set<string>();
  const seenFunnelChatIds = new Set<string>();
  let imported = 0;
  let skipped = 0;
  let removed = 0;

  // SAFETY: if the live conversations with a 状态 suddenly collapse to <50% of the
  // existing mirror, the upstream table is probably mid-edit — refuse to sync so we don't
  // wipe a good mirror. Compared against the mirror (not total rows) so permanently
  // status-less legacy rows don't trip it. Triggered the day 到店排期 was restructured.
  const withStatus = records.filter((r) => cellText(r.fields['状态']).trim()).length;
  const existing = (db.prepare(`SELECT COUNT(*) c FROM ig_funnel`).get() as any)?.c || 0;
  if (existing > 20 && withStatus < existing * 0.5) {
    throw new Error(
      `Aborting: only ${withStatus} rows have a 状态 but the mirror has ${existing} — upstream looks mid-edit. ` +
      `Refusing to overwrite. Re-run once statuses are restored.`
    );
  }

  const tx = db.transaction((rows: FeishuRecord[]) => {
    for (const rec of rows) {
      const f = rec.fields;
      const status = cellText(f['状态']).trim();
      // No 状态 = legacy/untracked row (e.g. pre-6/1 conversations the team didn't rebuild).
      // Skip entirely so the mirror only reflects active, tracked conversations.
      if (!status) { skipped++; continue; }
      const chatId = cellText(f['会话ID']).trim() || rec.record_id;
      const { username, url } = parseIgLink(f['IG链接']);
      const name = (cellText(f['博主']).trim() || username || 'Unknown').slice(0, 100);
      const platform = cellText(f['平台']).trim().toLowerCase() === 'ig' ? 'instagram' : (cellText(f['平台']) || 'instagram');
      const restaurant = cellText(f['餐厅']).trim() || 'Unassigned';
      const visitRaw = cellText(f['到店时间']).trim();
      const visitDate = parseDate(f['到店时间']);
      const visitTime = visitRaw.replace(/^\s*\d{4}-\d{2}-\d{2}\s*/, '').trim(); // "7:00 PM" part
      const pubDate = parseDate(f['发布日期']);
      const notes = cellText(f['notes']).slice(0, 1000);
      const schedMsg = cellText(f['Scheduled Message']).slice(0, 2000);
      const mealCredit = parseMoney(f['餐补']);
      const cash = parseMoney(f['Additional Payment']);
      const payStatusRaw = cellText(f['支付状态']).trim();
      const paid = payStatusRaw.includes('已支付') ? 1 : 0;
      // 发布链接 is a newer field the team added; fall back to the profile url for published rows.
      const postUrl = cellText(f['发布链接']).trim() || (status === '已发布' ? url : '');
      const bucket = BUCKET_MAP[status] || 'unknown';
      const now = new Date().toISOString();
      // Feishu's built-in last-modified time = when this conversation's row last changed
      // (good "how stale is this" signal for the to-do queues). Needs automatic_fields=true.
      const lastModified = rec.last_modified_time ? new Date(rec.last_modified_time).toISOString() : null;

      // --- funnel mirror: EVERY row (full funnel, this is the Overview's source) ---
      seenFunnelChatIds.add(chatId);
      db.prepare(
        `INSERT INTO ig_funnel (chat_id, channel, name, handle, restaurant, status_raw, bucket, note, visit_date, visit_time, pub_date, post_url, scheduled_message, last_modified, paid, amount, updated_at)
         VALUES (?, 'instagram', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(chat_id) DO UPDATE SET name=excluded.name, handle=excluded.handle, restaurant=excluded.restaurant,
           status_raw=excluded.status_raw, bucket=excluded.bucket, note=excluded.note, visit_date=excluded.visit_date,
           visit_time=excluded.visit_time, pub_date=excluded.pub_date, post_url=excluded.post_url,
           scheduled_message=excluded.scheduled_message, last_modified=excluded.last_modified, paid=excluded.paid, amount=excluded.amount, updated_at=excluded.updated_at`
      ).run(chatId, name, username, restaurant, status, bucket, notes, visitDate, visitTime, pubDate, postUrl, schedMsg, lastModified, paid, cash, now);
      funnelCounts[bucket] = (funnelCounts[bucket] || 0) + 1;

      // --- downstream CRM (kanban/payment) only for confirmed+ rows ---
      const stage = STAGE_MAP[status];
      if (!stage) { skipped++; continue; }
      seenChatIds.add(chatId);

      const campaignId = upsertCampaign(restaurant, campaignCache);

      // --- influencer (dedup by feishu_chat_id) ---
      let inf = db.prepare(`SELECT id FROM influencers WHERE feishu_chat_id = ?`).get(chatId) as any;
      let influencerId: string;
      if (inf) {
        influencerId = inf.id;
        db.prepare(`UPDATE influencers SET name=?, username=?, platform=? WHERE id=?`)
          .run(name, username, platform, influencerId);
      } else {
        influencerId = uuidv4();
        db.prepare(
          `INSERT INTO influencers (id, name, platform, username, feishu_chat_id) VALUES (?, ?, ?, ?, ?)`
        ).run(influencerId, name, platform, username, chatId);
      }

      // One Feishu conversation (chat_id) = one influencer = one card. The restaurant
      // (campaign) is a MUTABLE attribute, so key these on influencer_id alone and update
      // campaign_id — otherwise changing the restaurant upstream orphans the old row.

      // --- pipeline ---
      const pipe = db.prepare(`SELECT id FROM pipeline WHERE influencer_id=?`).get(influencerId) as any;
      if (pipe) {
        db.prepare(`UPDATE pipeline SET campaign_id=?, stage=?, publication_date=?, team_member_id=?, updated_at=? WHERE id=?`)
          .run(campaignId, stage, pubDate || visitDate, teamMemberId, now, pipe.id);
      } else {
        db.prepare(
          `INSERT INTO pipeline (id, influencer_id, campaign_id, team_member_id, stage, publication_date) VALUES (?, ?, ?, ?, ?, ?)`
        ).run(uuidv4(), influencerId, campaignId, teamMemberId, stage, pubDate || visitDate);
      }

      // --- content_schedule for published rows ---
      if (stage === 'published') {
        const cs = db.prepare(`SELECT id FROM content_schedule WHERE influencer_id=?`).get(influencerId) as any;
        if (cs) {
          db.prepare(`UPDATE content_schedule SET campaign_id=?, scheduled_date=?, platform=?, video_url=?, price=?, published_at=? WHERE id=?`)
            .run(campaignId, pubDate || visitDate || now.slice(0, 10), platform, url, cash, pubDate, cs.id);
        } else {
          db.prepare(
            `INSERT INTO content_schedule (id, influencer_id, campaign_id, scheduled_date, platform, content_type, video_url, status, price, published_at)
             VALUES (?, ?, ?, ?, ?, 'video', ?, 'published', ?, ?)`
          ).run(uuidv4(), influencerId, campaignId, pubDate || visitDate || now.slice(0, 10), platform, url, cash, pubDate);
        }
      }

      // --- payment (only when there is real cash) ---
      if (cash > 0) {
        const pay = db.prepare(`SELECT id FROM payments WHERE influencer_id=?`).get(influencerId) as any;
        const payStatus = payStatusRaw.includes('已支付') ? 'paid' : 'pending';
        if (pay) {
          db.prepare(`UPDATE payments SET campaign_id=?, amount=?, status=? WHERE id=?`).run(campaignId, cash, payStatus, pay.id);
        } else {
          db.prepare(
            `INSERT INTO payments (id, influencer_id, campaign_id, amount, currency, status, notes) VALUES (?, ?, ?, ?, 'USD', ?, ?)`
          ).run(uuidv4(), influencerId, campaignId, cash, payStatus, `meal credit: ${mealCredit}`);
        }
      }

      byStage[stage] = (byStage[stage] || 0) + 1;
      imported++;
    }
  });

  tx(records);
  removed = db.transaction(() => {
    // funnel mirror: drop conversations no longer present upstream
    const allFunnel = db.prepare(`SELECT chat_id FROM ig_funnel`).all() as any[];
    for (const r of allFunnel) {
      if (!seenFunnelChatIds.has(r.chat_id)) db.prepare(`DELETE FROM ig_funnel WHERE chat_id=?`).run(r.chat_id);
    }
    return reconcile(seenChatIds);
  })();
  return { scanned: records.length, imported, skipped, removed, funnel: funnelCounts, byStage, campaigns: [...campaignCache.keys()] };
}

export async function syncFromFeishu(): Promise<SyncResult> {
  if (!APP_ID || !BITABLE || !VISITS_TABLE) {
    throw new Error('Missing Feishu config — set FEISHU_APP_ID, FEISHU_BITABLE_APP_TOKEN, FEISHU_VISITS_TABLE_ID in .env (see .env.example)');
  }
  const token = await tenantToken();
  const records = await listRecords(token, VISITS_TABLE);
  return syncFromRecords(records);
}
