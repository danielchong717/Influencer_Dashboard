/**
 * Feishu → Dashboard one-way sync.
 *
 * Source of truth is the Feishu bitable "到店排期" (visit schedule) maintained by the
 * ig-dm-system pipeline (Unipile IG DMs + Gmail → AI status). This module pulls the
 * DOWNSTREAM (confirmed) rows only and upserts them into the dashboard's SQLite so the
 * dashboard can act as the visual command-center / reporting layer.
 *
 * Direction is strictly one-way (Feishu → dashboard). Never write back to Feishu here.
 * NOTE: Feishu field names (状态, 博主, etc.) MUST stay in Chinese — they map to real Feishu columns.
 */
import db from '../db';
import { v4 as uuidv4 } from 'uuid';

const BASE = 'https://open.feishu.cn';

const APP_ID = process.env.FEISHU_APP_ID || '';
const APP_SECRET = process.env.FEISHU_APP_SECRET || '';
const BITABLE = process.env.FEISHU_BITABLE_APP_TOKEN || '';
const VISITS_TABLE = process.env.FEISHU_VISITS_TABLE_ID || '';
const EMAIL_BASE = process.env.FEISHU_EMAIL_BASE_TOKEN || '';
const EMAIL_TABLE = process.env.FEISHU_EMAIL_TABLE_ID || '';

const STAGE_MAP: Record<string, string> = {
  已敲定待约时间: 'confirmed',
  已排期: 'scheduled',
  已到店: 'creating_video',
  已发布: 'published',
};

const BUCKET_MAP: Record<string, string> = {
  已发未回复: 'no_reply',
  等博主回: 'talking',
  等我们回: 'talking',
  已敲定待约时间: 'talking',
  已排期: 'scheduled',
  已到店: 'visited',
  '待发 reel': 'visited',
  待发帖: 'visited',
  已发布: 'published',
  婉拒告吹: 'declined',
  取消: 'declined',
};

const STATUS_DONE_FIELD: Record<string, string> = {
  等我们回: '已回复',
  已敲定待约时间: '时间已跟进',
  已排期: '邀约已发',
  已到店: '已催发帖', '待发 reel': '已催发帖', 待发帖: '已催发帖',
};

export const ACTION_FIELD: Record<string, string> = {
  reply: '已回复', settime: '时间已跟进', invite: '邀约已发', chase: '已催发帖',
};

export const FUNNEL_ORDER = ['no_reply', 'talking', 'scheduled', 'visited', 'published'] as const;
export const FUNNEL_LABELS: Record<string, string> = {
  no_reply: 'Awaiting Reply', talking: 'In Discussion', scheduled: 'Time Scheduled',
  visited: 'Visited', published: 'Published', declined: 'Declined', unknown: 'Unknown',
};

type FeishuRecord = { record_id: string; fields: Record<string, any>; last_modified_time?: number; shared_url?: string };

async function fetchSharedUrls(token: string, ids: string[], base: string = BITABLE, table: string = VISITS_TABLE): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const url = `${BASE}/open-apis/bitable/v1/apps/${base}/tables/${table}/records/batch_get`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ record_ids: chunk, with_shared_url: true }),
    });
    const d: any = await r.json();
    if (d.code !== 0) continue;
    for (const rec of d.data?.records || []) {
      if (rec.shared_url) out[rec.record_id] = rec.shared_url;
    }
  }
  return out;
}

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

async function listRecords(token: string, table: string, base: string = BITABLE): Promise<FeishuRecord[]> {
  const out: FeishuRecord[] = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({ page_size: '500', automatic_fields: 'true' });
    if (pageToken) q.set('page_token', pageToken);
    const url = `${BASE}/open-apis/bitable/v1/apps/${base}/tables/${table}/records?${q}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const d: any = await r.json();
    if (d.code !== 0) throw new Error(`read table failed ${table}: ${JSON.stringify(d)}`);
    out.push(...(d.data?.items || []));
    pageToken = d.data?.has_more ? d.data.page_token : undefined;
  } while (pageToken);
  return out;
}

type FunnelEntry = {
  chat_id: string; channel: string; name: string; handle: string; restaurant: string;
  status_raw: string; bucket: string; note: string; last_modified: string | null; feishu_url: string; record_id: string;
};

async function fetchEmailEntries(token: string): Promise<FunnelEntry[]> {
  if (!EMAIL_BASE || !EMAIL_TABLE) return [];
  const ACTION: Record<string, string> = { 'Reply needed': '等我们回', 'Ready to schedule': '已敲定待约时间' };
  let rows: FeishuRecord[];
  try {
    rows = await listRecords(token, EMAIL_TABLE, EMAIL_BASE);
  } catch {
    return [];
  }
  const actionable = rows.filter((r) => {
    const g = cellText(r.fields['Group']).trim();
    return ACTION[g] && cellText(r.fields['Scheduled']).trim().toLowerCase() !== 'yes';
  });
  const urls = await fetchSharedUrls(token, actionable.map((r) => r.record_id), EMAIL_BASE, EMAIL_TABLE);
  return actionable.map((r) => {
    const f = r.fields;
    const g = cellText(f['Group']).trim();
    return {
      chat_id: 'em_' + r.record_id,
      channel: '邮件',
      name: (cellText(f['Name']).trim() || 'Unknown').slice(0, 100),
      handle: '',
      restaurant: cellText(f['Restaurant']).trim() || 'Unassigned',
      status_raw: ACTION[g],
      bucket: 'talking',
      note: (cellText(f['Next Step']) || cellText(f['Status'])).slice(0, 1000),
      last_modified: r.last_modified_time ? new Date(r.last_modified_time).toISOString() : null,
      feishu_url: urls[r.record_id] || '',
      record_id: r.record_id,
    };
  });
}

function cellText(v: any): string {
  if (v == null) return '';
  if (Array.isArray(v)) {
    return v.map((x) => {
      if (x && typeof x === 'object') {
        if (Array.isArray(x.text_arr)) return x.text_arr.join('');
        return x.text || x.name || '';
      }
      return String(x);
    }).join('');
  }
  if (typeof v === 'object') return v.text || v.name || '';
  return String(v);
}

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
  db.prepare(`INSERT INTO team_members (id, name, email) VALUES (?, ?, ?)`).run(id, 'Feishu Sync', 'feishu-sync@local');
  return id;
}

function upsertCampaign(name: string, cache: Map<string, string>): string {
  if (cache.has(name)) return cache.get(name)!;
  const row = db.prepare(`SELECT id FROM campaigns WHERE name = ?`).get(name) as any;
  if (row) { cache.set(name, row.id); return row.id; }
  const id = uuidv4();
  db.prepare(`INSERT INTO campaigns (id, name, status) VALUES (?, ?, 'active')`).run(id, name);
  cache.set(name, id);
  return id;
}

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
      post_type TEXT,
      owner TEXT,
      scheduled_message TEXT,
      last_modified TEXT,
      feishu_url TEXT,
      record_id TEXT,
      action_done INTEGER DEFAULT 0,
      paid INTEGER DEFAULT 0,
      amount REAL DEFAULT 0,
      updated_at TEXT
    )
  `);
  const cols = (db.prepare(`PRAGMA table_info(ig_funnel)`).all() as any[]).map((c) => c.name);
  if (!cols.includes('scheduled_message')) db.exec(`ALTER TABLE ig_funnel ADD COLUMN scheduled_message TEXT`);
  if (!cols.includes('visit_time')) db.exec(`ALTER TABLE ig_funnel ADD COLUMN visit_time TEXT`);
  if (!cols.includes('last_modified')) db.exec(`ALTER TABLE ig_funnel ADD COLUMN last_modified TEXT`);
  if (!cols.includes('feishu_url')) db.exec(`ALTER TABLE ig_funnel ADD COLUMN feishu_url TEXT`);
  if (!cols.includes('post_type')) db.exec(`ALTER TABLE ig_funnel ADD COLUMN post_type TEXT`);
  if (!cols.includes('owner')) db.exec(`ALTER TABLE ig_funnel ADD COLUMN owner TEXT`);
  if (!cols.includes('record_id')) db.exec(`ALTER TABLE ig_funnel ADD COLUMN record_id TEXT`);
  if (!cols.includes('action_done')) db.exec(`ALTER TABLE ig_funnel ADD COLUMN action_done INTEGER DEFAULT 0`);
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

function reconcile(seenChatIds: Set<string>): number {
  const stale = db.prepare(`SELECT id, feishu_chat_id FROM influencers WHERE feishu_chat_id IS NOT NULL`).all() as any[];
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

export function syncFromRecords(records: FeishuRecord[], emailEntries: FunnelEntry[] = []): SyncResult {
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

  const withStatus = records.filter((r) => cellText(r.fields['状态']).trim()).length;
  const existing = (db.prepare(`SELECT COUNT(*) c FROM ig_funnel`).get() as any)?.c || 0;
  if (existing > 20 && withStatus < existing * 0.5) {
    throw new Error(
      `Aborting: only ${withStatus} rows have a status but the mirror has ${existing} — upstream looks mid-edit. ` +
      `Refusing to overwrite. Re-run once statuses are restored.`
    );
  }

  const tx = db.transaction((rows: FeishuRecord[]) => {
    for (const rec of rows) {
      const f = rec.fields;
      const status = cellText(f['状态']).trim();
      if (!status) { skipped++; continue; }
      const chatId = cellText(f['会话ID']).trim() || rec.record_id;
      const { username, url } = parseIgLink(f['IG链接']);
      const name = (cellText(f['博主']).trim() || username || 'Unknown').slice(0, 100);
      const platform = cellText(f['平台']).trim().toLowerCase() === 'ig' ? 'instagram' : (cellText(f['平台']) || 'instagram');
      const restaurant = cellText(f['餐厅']).trim() || 'Unassigned';
      const visitRaw = cellText(f['到店时间']).trim();
      const visitDate = parseDate(f['到店时间']);
      const visitTime = visitRaw.replace(/^\s*\d{4}-\d{2}-\d{2}\s*/, '').trim();
      const pubDate = parseDate(f['发布日期']);
      const notes = cellText(f['notes']).slice(0, 1000);
      const schedMsg = cellText(f['Scheduled Message']).slice(0, 2000);
      const mealCredit = parseMoney(f['餐补']);
      const cash = parseMoney(f['Additional Payment']);
      const payStatusRaw = cellText(f['支付状态']).trim();
      const paid = payStatusRaw.includes('已支付') ? 1 : 0;
      const postUrl = cellText(f['发布链接']).trim() || (status === '已发布' ? url : '');
      const bucket = BUCKET_MAP[status] || 'unknown';
      const now = new Date().toISOString();
      const lastModified = rec.last_modified_time ? new Date(rec.last_modified_time).toISOString() : null;
      const channelRaw = cellText(f['平台']).trim();
      const channel = channelRaw === 'IG' ? 'IG' : channelRaw === 'Email' ? '邮件' : (channelRaw || 'IG');
      const feishuUrl = rec.shared_url || '';
      const postType = cellText(f['帖子类型']).trim();
      const owner = cellText(f['负责人']).trim();
      const doneField = STATUS_DONE_FIELD[status];
      const actionDone = doneField && f[doneField] === true ? 1 : 0;

      seenFunnelChatIds.add(chatId);
      db.prepare(
        `INSERT INTO ig_funnel (chat_id, channel, name, handle, restaurant, status_raw, bucket, note, visit_date, visit_time, pub_date, post_url, post_type, owner, scheduled_message, last_modified, feishu_url, record_id, action_done, paid, amount, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(chat_id) DO UPDATE SET channel=excluded.channel, name=excluded.name, handle=excluded.handle, restaurant=excluded.restaurant,
           status_raw=excluded.status_raw, bucket=excluded.bucket, note=excluded.note, visit_date=excluded.visit_date,
           visit_time=excluded.visit_time, pub_date=excluded.pub_date, post_url=excluded.post_url, post_type=excluded.post_type, owner=excluded.owner,
           scheduled_message=excluded.scheduled_message, last_modified=excluded.last_modified, feishu_url=excluded.feishu_url,
           record_id=excluded.record_id, action_done=excluded.action_done, paid=excluded.paid, amount=excluded.amount, updated_at=excluded.updated_at`
      ).run(chatId, channel, name, username, restaurant, status, bucket, notes, visitDate, visitTime, pubDate, postUrl, postType, owner, schedMsg, lastModified, feishuUrl, rec.record_id, actionDone, paid, cash, now);
      funnelCounts[bucket] = (funnelCounts[bucket] || 0) + 1;

      const stage = STAGE_MAP[status];
      if (!stage) { skipped++; continue; }
      seenChatIds.add(chatId);

      const campaignId = upsertCampaign(restaurant, campaignCache);

      let inf = db.prepare(`SELECT id FROM influencers WHERE feishu_chat_id = ?`).get(chatId) as any;
      let influencerId: string;
      if (inf) {
        influencerId = inf.id;
        db.prepare(`UPDATE influencers SET name=?, username=?, platform=? WHERE id=?`).run(name, username, platform, influencerId);
      } else {
        influencerId = uuidv4();
        db.prepare(`INSERT INTO influencers (id, name, platform, username, feishu_chat_id) VALUES (?, ?, ?, ?, ?)`).run(influencerId, name, platform, username, chatId);
      }

      const pipe = db.prepare(`SELECT id FROM pipeline WHERE influencer_id=?`).get(influencerId) as any;
      if (pipe) {
        db.prepare(`UPDATE pipeline SET campaign_id=?, stage=?, publication_date=?, team_member_id=?, updated_at=? WHERE id=?`).run(campaignId, stage, pubDate || visitDate, teamMemberId, now, pipe.id);
      } else {
        db.prepare(`INSERT INTO pipeline (id, influencer_id, campaign_id, team_member_id, stage, publication_date) VALUES (?, ?, ?, ?, ?, ?)`).run(uuidv4(), influencerId, campaignId, teamMemberId, stage, pubDate || visitDate);
      }

      if (stage === 'published') {
        const cs = db.prepare(`SELECT id FROM content_schedule WHERE influencer_id=?`).get(influencerId) as any;
        if (cs) {
          db.prepare(`UPDATE content_schedule SET campaign_id=?, scheduled_date=?, platform=?, video_url=?, price=?, published_at=? WHERE id=?`).run(campaignId, pubDate || visitDate || now.slice(0, 10), platform, url, cash, pubDate, cs.id);
        } else {
          db.prepare(`INSERT INTO content_schedule (id, influencer_id, campaign_id, scheduled_date, platform, content_type, video_url, status, price, published_at) VALUES (?, ?, ?, ?, ?, 'video', ?, 'published', ?, ?)`).run(uuidv4(), influencerId, campaignId, pubDate || visitDate || now.slice(0, 10), platform, url, cash, pubDate);
        }
      }

      if (cash > 0) {
        const pay = db.prepare(`SELECT id FROM payments WHERE influencer_id=?`).get(influencerId) as any;
        const payStatus = payStatusRaw.includes('已支付') ? 'paid' : 'pending';
        if (pay) {
          db.prepare(`UPDATE payments SET campaign_id=?, amount=?, status=? WHERE id=?`).run(campaignId, cash, payStatus, pay.id);
        } else {
          db.prepare(`INSERT INTO payments (id, influencer_id, campaign_id, amount, currency, status, notes) VALUES (?, ?, ?, ?, 'USD', ?, ?)`).run(uuidv4(), influencerId, campaignId, cash, payStatus, `meal credit: ${mealCredit}`);
        }
      }

      byStage[stage] = (byStage[stage] || 0) + 1;
      imported++;
    }

    for (const e of emailEntries) {
      seenFunnelChatIds.add(e.chat_id);
      db.prepare(
        `INSERT INTO ig_funnel (chat_id, channel, name, handle, restaurant, status_raw, bucket, note, last_modified, feishu_url, record_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(chat_id) DO UPDATE SET channel=excluded.channel, name=excluded.name, restaurant=excluded.restaurant,
           status_raw=excluded.status_raw, bucket=excluded.bucket, note=excluded.note,
           last_modified=excluded.last_modified, feishu_url=excluded.feishu_url, record_id=excluded.record_id, updated_at=excluded.updated_at`
      ).run(e.chat_id, e.channel, e.name, e.handle, e.restaurant, e.status_raw, e.bucket, e.note, e.last_modified, e.feishu_url, e.record_id, new Date().toISOString());
      funnelCounts[e.bucket] = (funnelCounts[e.bucket] || 0) + 1;
    }
  });

  tx(records);
  removed = db.transaction(() => {
    const allFunnel = db.prepare(`SELECT chat_id FROM ig_funnel`).all() as any[];
    for (const r of allFunnel) {
      if (!seenFunnelChatIds.has(r.chat_id)) db.prepare(`DELETE FROM ig_funnel WHERE chat_id=?`).run(r.chat_id);
    }
    return reconcile(seenChatIds);
  })();
  return { scanned: records.length, imported, skipped, removed, funnel: funnelCounts, byStage, campaigns: [...campaignCache.keys()] };
}

async function updateRecord(token: string, recordId: string, fields: Record<string, any>): Promise<void> {
  const url = `${BASE}/open-apis/bitable/v1/apps/${BITABLE}/tables/${VISITS_TABLE}/records/${recordId}`;
  const r = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  const d: any = await r.json();
  if (d.code !== 0) throw new Error(`update record failed: ${JSON.stringify(d)}`);
}

export async function markAction(chatId: string, action: string, done: boolean): Promise<{ ok: boolean; error?: string }> {
  const row = db.prepare(`SELECT record_id FROM ig_funnel WHERE chat_id=?`).get(chatId) as any;
  if (!row) return { ok: false, error: 'row not found' };
  const isIG = !chatId.startsWith('em_') && row.record_id;
  try {
    if (action === 'pay') {
      if (isIG && BITABLE && VISITS_TABLE) {
        const token = await tenantToken();
        await updateRecord(token, row.record_id, { 支付状态: done ? '已支付' : '未支付' });
      }
      db.prepare(`UPDATE ig_funnel SET paid=? WHERE chat_id=?`).run(done ? 1 : 0, chatId);
    } else {
      const field = ACTION_FIELD[action];
      if (!field) return { ok: false, error: `unknown action: ${action}` };
      if (isIG && BITABLE && VISITS_TABLE) {
        const token = await tenantToken();
        await updateRecord(token, row.record_id, { [field]: done });
      }
      db.prepare(`UPDATE ig_funnel SET action_done=? WHERE chat_id=?`).run(done ? 1 : 0, chatId);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function syncFromFeishu(): Promise<SyncResult> {
  if (!APP_ID || !BITABLE || !VISITS_TABLE) {
    throw new Error('Missing Feishu config — set FEISHU_APP_ID, FEISHU_BITABLE_APP_TOKEN, FEISHU_VISITS_TABLE_ID in .env');
  }
  const token = await tenantToken();
  const records = await listRecords(token, VISITS_TABLE);
  const active = records.filter((r) => cellText(r.fields['状态']).trim());
  const urls = await fetchSharedUrls(token, active.map((r) => r.record_id));
  for (const r of records) r.shared_url = urls[r.record_id];
  const emailEntries = await fetchEmailEntries(token);
  return syncFromRecords(records, emailEntries);
}
