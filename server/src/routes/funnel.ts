import { Router } from 'express';
import db from '../db';
import { FUNNEL_ORDER, FUNNEL_LABELS, markAction, syncFromFeishu, editRecordFields, resolveIssue } from '../services/feishuSync';
import { sendIgMessage } from '../services/unipile';

const router = Router();

// POST /api/funnel/action — write a team-action back to Feishu (two-way).
// body: { chat_id, action: reply|settime|invite|chase|pay, done }
router.post('/action', async (req, res) => {
  const { chat_id, action, done } = req.body || {};
  if (!chat_id || !action) return res.status(400).json({ ok: false, error: 'chat_id and action required' });
  const r = await markAction(chat_id, action, done !== false);
  res.status(r.ok ? 200 : 500).json(r);
});

// Allow only a DIRECT localhost browser — NOT the public Cloudflare tunnel. cloudflared
// forwards to localhost:3001, so the socket IP is always loopback even for tunnel traffic;
// the reliable discriminator is Cloudflare's injected headers (cf-ray / cf-connecting-ip /
// x-forwarded-for), which a direct local request never carries. Defense-in-depth: the
// frontend also hides the send button off-localhost.
function isLocalDirect(req: any): boolean {
  const h = req.headers || {};
  if (h['cf-ray'] || h['cf-connecting-ip'] || h['x-forwarded-for']) return false;
  const ip = String(req.socket?.remoteAddress || '').replace('::ffff:', '');
  return ip === '127.0.0.1' || ip === '::1';
}

// POST /api/funnel/send — send the approved AI reply to the influencer as an IG DM (Unipile).
// LOCALHOST-ONLY: sending real DMs is destructive and the dashboard is also exposed on a
// public no-auth tunnel, so this is gated to the operator's own machine. On success we mark
// 已回复 (reply action) so the row leaves the queue and the team sees it via Feishu.
// body: { chat_id, text }
router.post('/send', async (req, res) => {
  if (!isLocalDirect(req)) return res.status(403).json({ ok: false, error: '只能在本机(localhost)发送，公开网址不允许' });
  const { chat_id, text } = req.body || {};
  if (!chat_id || !text || !String(text).trim()) return res.status(400).json({ ok: false, error: 'chat_id 和 text 必填' });
  if (String(chat_id).startsWith('em_')) return res.status(400).json({ ok: false, error: '邮件渠道不能用 IG 发送' });
  const sent = await sendIgMessage(chat_id, String(text));
  if (!sent.ok) return res.status(502).json(sent);
  const marked = await markAction(chat_id, 'reply', true); // ball's in their court now → leaves 待回复 queue
  res.json({ ok: true, marked: marked.ok });
});

// POST /api/funnel/resync — on-demand "pull latest from Feishu → SQLite mirror".
// The hourly launchd dashboard-sync does this on a schedule; this lets the 刷新 button
// trigger it NOW so the board reflects Feishu without waiting up to an hour. Read-only on
// Feishu (only writes the local mirror), so it's safe from the public tunnel too. A single
// in-flight guard coalesces rapid clicks / concurrent browsers onto one running sync.
let resyncInFlight: Promise<any> | null = null;
router.post('/resync', async (_req, res) => {
  try {
    if (!resyncInFlight) {
      resyncInFlight = syncFromFeishu().finally(() => { resyncInFlight = null; });
    }
    const r = await resyncInFlight;
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(502).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

// POST /api/funnel/edit — #3: human edits a structured field (餐补/Additional Payment/到店时间/状态)
// on the board → written straight to Feishu (source of truth) + mirror updated. Not localhost-gated
// (team on the public URL needs to edit too); writes are whitelisted + only to the visits table.
// body: { chat_id, fields: { dining_credit?, additional_payment?, visit_time?, status? } }
router.post('/edit', async (req, res) => {
  const { chat_id, fields } = req.body || {};
  if (!chat_id || !fields || typeof fields !== 'object' || Array.isArray(fields))
    return res.status(400).json({ ok: false, error: 'chat_id 和 fields 必填' });
  const r = await editRecordFields(chat_id, fields);
  res.status(r.ok ? 200 : 502).json(r);
});

// POST /api/funnel/issue/resolve — Phase 2: resolve an AI-raised issue. Optionally apply a fix
// (apply: {dining_credit?, visit_time?, status?, ...}) to the visit row first, then mark the
// Feishu Issues row resolved so it leaves the queue for the whole team.
// body: { issue_id, apply? }
router.post('/issue/resolve', async (req, res) => {
  const { issue_id, apply } = req.body || {};
  if (!issue_id) return res.status(400).json({ ok: false, error: 'issue_id 必填' });
  const r = await resolveIssue(issue_id, apply && typeof apply === 'object' ? apply : undefined);
  res.status(r.ok ? 200 : 502).json(r);
});

function funnelExists(): boolean {
  return !!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='ig_funnel'`).get();
}

const item = (r: any) => ({
  chat_id: r.chat_id,
  name: r.name, handle: r.handle, restaurant: r.restaurant, status: r.status_raw, channel: r.channel,
  note: r.note, visit_date: r.visit_date, visit_time: r.visit_time, visit_raw: r.visit_raw, pub_date: r.pub_date,
  dining_credit: r.dining_credit, add_pay_raw: r.add_pay_raw,
  post_url: r.post_url, post_type: r.post_type, owner: r.owner, scheduled_message: r.scheduled_message,
  reply_draft: r.reply_draft, last_inbound: r.last_inbound,
  last_modified: r.last_modified, feishu_url: r.feishu_url, action_done: !!r.action_done, paid: !!r.paid, amount: r.amount,
  status_locked: !!r.status_locked,
});

/**
 * GET /api/funnel — single data source for the Overview panel.
 * Returns: at-a-glance metrics (counts per bucket) + actionable To-Do queues + payments.
 * Restaurant filter comes from the global campaign switcher (?restaurant=).
 */
router.get('/', (req, res) => {
  const { restaurant } = req.query as { restaurant?: string };

  if (!funnelExists()) {
    return res.json({ ready: false, order: FUNNEL_ORDER, labels: FUNNEL_LABELS,
      metrics: {}, total: 0, declined: 0, todos: { scheduled_msg: [], reply_needed: [], to_post: [], unpaid: [] },
      arrivals: { week_end: null, today: [], tomorrow: [], later: [] },
      payments: { paid: 0, unpaid: 0 }, restaurants: [], byRestaurant: [] });
  }

  const where = restaurant ? 'WHERE restaurant = ?' : '';
  const params = restaurant ? [restaurant] : [];
  const rows = db.prepare(`SELECT * FROM ig_funnel ${where}`).all(...params) as any[];

  // at-a-glance metrics (counts only — passive buckets need no names)
  const metrics: Record<string, number> = {};
  for (const b of FUNNEL_ORDER) metrics[b] = 0;
  let declined = 0;
  for (const r of rows) {
    if (r.bucket === 'declined') declined++;
    else if (metrics[r.bucket] !== undefined) metrics[r.bucket]++;
  }

  // To-Do action queues (these need names + context).
  // Dates MUST be computed in NYC time: the user + all restaurants are in America/New_York,
  // and visit_date is stored as a NYC calendar date. Using UTC (toISOString) makes "today"
  // jump a day ahead every evening after ~8pm EDT, mis-filing tomorrow's visits as today's.
  const TZ = 'America/New_York';
  const ymd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ }); // → "YYYY-MM-DD" in NYC
  const today = ymd(new Date());
  const tomorrow = ymd(new Date(Date.now() + 86400000));
  const byVisit = (a: any, b: any) => (a.visit_date || '9999').localeCompare(b.visit_date || '9999');
  // stalest first: the row untouched longest floats to the top (most likely to be forgotten)
  const byStale = (a: any, b: any) => (a.last_modified || '9999').localeCompare(b.last_modified || '9999');
  // for 待回复: how long the ball's been in OUR court = since the influencer's last message.
  // Oldest waiting first (fall back to last_modified when the inbound time isn't recorded yet).
  const byWaiting = (a: any, b: any) => (a.last_inbound || a.last_modified || '9999').localeCompare(b.last_inbound || b.last_modified || '9999');
  const todos = {
    // ONLY 已排期 (an actual time is set) belongs here — you can't send a dated Scheduled
    // Message without a time. 已敲定待约时间 (agreed, no time yet) stays in the 沟通中 metric.
    // Soonest visit first; today/tomorrow flagged so the client can pin the day-of reminders.
    scheduled_msg: rows.filter((r) => r.status_raw === '已排期')
      .sort(byVisit)
      .map((r) => ({ ...item(r), is_today: r.visit_date === today, is_tomorrow: r.visit_date === tomorrow })),
    reply_needed: rows.filter((r) => r.status_raw === '等我们回').sort(byWaiting).map(item),
    // agreed to collab but no time set yet → our move is to nail down a time
    set_time: rows.filter((r) => r.status_raw === '已敲定待约时间').sort(byStale).map(item),
    to_post: rows.filter((r) => ['已到店', '待发 reel', '待发帖'].includes(r.status_raw)).sort(byVisit).map(item),
    unpaid: rows.filter((r) => r.amount > 0 && !r.paid).sort(byStale).map(item),
  };

  // upcoming arrivals — the daily "who's coming in" agenda. Any conversation with a visit
  // date set, from today through the end of this week (Sunday), that hasn't been declined.
  // This is the FIRST thing the user checks each morning: today/tomorrow/rest-of-week.
  // rolling 7-day lookahead (NOT "through Sunday" — that collapses to nothing on weekends,
  // hiding next week's confirmed visits exactly when you'd plan them). today … today+6.
  const horizon = ymd(new Date(Date.now() + 6 * 86400000));
  const byTime = (a: any, b: any) => byVisit(a, b) || (a.visit_time || '99:99').localeCompare(b.visit_time || '99:99');
  // ONLY 已排期 (a locked, confirmed visit with a date) counts as a real upcoming arrival.
  // A row that rescheduled/cancelled moves to 等博主回/沟通中 etc. but its old 到店时间 lingers —
  // filtering by status (not just "has a date and isn't declined") keeps those off the calendar.
  const arrivalRows = rows
    .filter((r) => r.status_raw === '已排期' && r.visit_date && r.visit_date >= today && r.visit_date <= horizon)
    .sort(byTime);
  const arrivals = {
    week_end: horizon,
    today: arrivalRows.filter((r) => r.visit_date === today).map(item),
    tomorrow: arrivalRows.filter((r) => r.visit_date === tomorrow).map(item),
    later: arrivalRows.filter((r) => r.visit_date > tomorrow).map(item),
  };

  // published deliverables (reference) — the finished posts, with link + reel/story type
  const published = rows.filter((r) => r.bucket === 'published').sort((a, b) => (b.pub_date || '').localeCompare(a.pub_date || '')).map(item);

  const owed = rows.filter((r) => r.amount > 0);
  const payments = {
    paid: owed.filter((r) => r.paid).length,
    unpaid: owed.filter((r) => !r.paid).length,
    unpaid_total: owed.filter((r) => !r.paid).reduce((s, r) => s + (r.amount || 0), 0),
  };

  // per-restaurant mini breakdown. Unassigned is pulled OUT — it's a data-quality gap
  // (conversations the team hasn't tagged with a restaurant yet), not a real restaurant.
  const byRestaurant = Object.values(
    rows.reduce((acc: any, r) => {
      const name = r.restaurant || 'Unassigned';
      if (name === 'Unassigned') return acc;
      (acc[name] ||= { restaurant: name, total: 0, published: 0, scheduled: 0 });
      acc[name].total++;
      if (r.bucket === 'published') acc[name].published++;
      if (r.bucket === 'scheduled') acc[name].scheduled++;
      return acc;
    }, {})
  );
  const unassigned = rows.filter((r) => !r.restaurant || r.restaurant === 'Unassigned').length;

  const restaurants = (db.prepare(`SELECT DISTINCT restaurant FROM ig_funnel ORDER BY restaurant`).all() as any[])
    .map((x) => x.restaurant).filter((r) => r && r !== 'Unassigned');

  // existing 状态 option names (for the in-board edit dropdown — only offer valid options)
  const statuses = (db.prepare(`SELECT DISTINCT status_raw FROM ig_funnel WHERE status_raw IS NOT NULL AND status_raw != '' ORDER BY status_raw`).all() as any[])
    .map((x) => x.status_raw);

  // ⚠️ Issues — ONLY "needs your decision" exceptions (conflicts/errors/inconsistencies the
  // pipeline left in a weird state), NOT routine workflow (that's the To-Do queues) and NOT
  // data-quality nags. Phase 1 = what the dashboard can derive on its own; each carries a
  // one-click resolution that reuses the #3 write-back. Richer AI-raised conflicts = Phase 2.
  const issues: any[] = [];
  for (const r of rows) {
    // 文案脏: Scheduled Message has a duplicate "(covers food only)" after a clause that already
    // ends in ")" → the boss card reads garbled (the Ava/Magali bug). One-click strips it.
    if (r.scheduled_message && /\)\s+\(covers food only\)/.test(r.scheduled_message)) {
      issues.push({ ...item(r), issue: 'dirty_msg', sev: 'error', title: '卡片文案重复',
        detail: 'Scheduled Message 的 Dining Credit 行重复，发给老板的卡片会很乱' });
    }
    // 已排期但没到店时间: can't send a dated confirmation/reminder → you must set a time.
    if (r.status_raw === '已排期' && !r.visit_time) {
      issues.push({ ...item(r), issue: 'no_time', sev: 'decision', title: '已排期但缺到店时间',
        detail: '没有时间，发不了到店确认/提醒 — 去补一个时间' });
    }
    // 已到店但日期还在未来: status likely mis-judged (a visit that hasn't happened) → your call.
    if (r.status_raw === '已到店' && r.visit_date && r.visit_date > today) {
      issues.push({ ...item(r), issue: 'visited_future', sev: 'conflict', title: '已到店但到店日期在未来',
        detail: `到店日期 ${r.visit_date} 还没到，状态可能判错了` });
    }
    // 已发布但没链接: can't verify the deliverable → go add the post link.
    if (r.status_raw === '已发布' && !r.post_url) {
      issues.push({ ...item(r), issue: 'pub_no_link', sev: 'gap', title: '已发布但没有帖子链接',
        detail: '缺 reel/帖子链接，无法核对交付' });
    }
  }

  // Phase 2: merge AI-raised issues from the Feishu Issues mirror (ig_issues). FAIL-OPEN: if the
  // table doesn't exist yet, this is just []. Enrich with the funnel row (feishu_url/channel) and
  // restrict to the current restaurant filter. Phase-1 and Phase-2 issue types are disjoint, so the
  // merged list never collides; AI issues carry an issue_id so the UI can resolve them.
  try {
    const byChat = new Map(rows.map((r) => [r.chat_id, r]));
    const aiIssues = db.prepare(`SELECT * FROM ig_issues WHERE status='open'`).all() as any[];
    for (const ai of aiIssues) {
      const fr = byChat.get(ai.chat_id);
      if (restaurant && (!fr || fr.restaurant !== restaurant)) continue;  // respect the restaurant filter
      issues.push({
        chat_id: ai.chat_id, name: ai.name || fr?.name || ai.chat_id, restaurant: ai.restaurant || fr?.restaurant,
        channel: fr?.channel, feishu_url: fr?.feishu_url, status: fr?.status_raw,
        dining_credit: fr?.dining_credit, visit_raw: fr?.visit_raw, add_pay_raw: fr?.add_pay_raw,
        issue: ai.type, sev: ai.sev || 'conflict', title: ai.title, detail: ai.detail,
        ai_value: ai.ai_value, current_value: ai.current_value, issue_id: ai.record_id, source: 'ai',
      });
    }
  } catch { /* ig_issues not ready — Phase 1 issues still render */ }

  // freshness: the mirror is an hourly sync that can go stale — surface when it last ran.
  const lastSync = (db.prepare(`SELECT MAX(updated_at) m FROM ig_funnel`).get() as any)?.m || null;

  // cumulative funnel ("reached at least this stage") so it narrows monotonically and reads
  // as a real funnel — unlike the current-state metrics where 已发布 can exceed 已到店.
  const m = metrics;
  const funnelBar = [
    { key: 'talking', label: '沟通过', count: m.talking + m.scheduled + m.visited + m.published },
    { key: 'scheduled', label: '约过', count: m.scheduled + m.visited + m.published },
    { key: 'visited', label: '到店过', count: m.visited + m.published },
    { key: 'published', label: '已发布', count: m.published },
  ];

  res.json({
    ready: true, order: FUNNEL_ORDER, labels: FUNNEL_LABELS,
    total: rows.length, metrics, declined, todos, arrivals, published, payments, byRestaurant, unassigned, restaurants, statuses, issues, lastSync, funnelBar,
  });
});

export default router;
