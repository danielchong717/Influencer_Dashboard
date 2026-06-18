import { Router } from 'express';
import db from '../db';
import { FUNNEL_ORDER, FUNNEL_LABELS, markAction } from '../services/feishuSync';

const router = Router();

// POST /api/funnel/action — write a team-action back to Feishu (two-way).
// body: { chat_id, action: reply|settime|invite|chase|pay, done }
router.post('/action', async (req, res) => {
  const { chat_id, action, done } = req.body || {};
  if (!chat_id || !action) return res.status(400).json({ ok: false, error: 'chat_id and action required' });
  const r = await markAction(chat_id, action, done !== false);
  res.status(r.ok ? 200 : 500).json(r);
});

function funnelExists(): boolean {
  return !!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='ig_funnel'`).get();
}

const item = (r: any) => ({
  chat_id: r.chat_id,
  name: r.name, handle: r.handle, restaurant: r.restaurant, status: r.status_raw, channel: r.channel,
  note: r.note, visit_date: r.visit_date, visit_time: r.visit_time, pub_date: r.pub_date,
  post_url: r.post_url, post_type: r.post_type, owner: r.owner, scheduled_message: r.scheduled_message,
  last_modified: r.last_modified, feishu_url: r.feishu_url, action_done: !!r.action_done, paid: !!r.paid, amount: r.amount,
});

/**
 * GET /api/funnel — single data source for the Overview panel.
 * Returns: at-a-glance metrics + actionable to-do queues + payments.
 * Restaurant filter comes from the global campaign switcher (?restaurant=).
 */
router.get('/', (req, res) => {
  const { restaurant } = req.query as { restaurant?: string };

  if (!funnelExists()) {
    return res.json({ ready: false, order: FUNNEL_ORDER, labels: FUNNEL_LABELS,
      metrics: {}, total: 0, declined: 0, todos: { scheduled_msg: [], reply_needed: [], set_time: [], to_post: [], unpaid: [] },
      arrivals: { week_end: null, today: [], tomorrow: [], later: [] },
      payments: { paid: 0, unpaid: 0, unpaid_total: 0 }, restaurants: [], byRestaurant: [] });
  }

  const where = restaurant ? 'WHERE restaurant = ?' : '';
  const params = restaurant ? [restaurant] : [];
  const rows = db.prepare(`SELECT * FROM ig_funnel ${where}`).all(...params) as any[];

  const metrics: Record<string, number> = {};
  for (const b of FUNNEL_ORDER) metrics[b] = 0;
  let declined = 0;
  for (const r of rows) {
    if (r.bucket === 'declined') declined++;
    else if (metrics[r.bucket] !== undefined) metrics[r.bucket]++;
  }

  const TZ = 'America/New_York';
  const ymd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });
  const today = ymd(new Date());
  const tomorrow = ymd(new Date(Date.now() + 86400000));
  const byVisit = (a: any, b: any) => (a.visit_date || '9999').localeCompare(b.visit_date || '9999');
  const byStale = (a: any, b: any) => (a.last_modified || '9999').localeCompare(b.last_modified || '9999');
  const todos = {
    scheduled_msg: rows.filter((r) => r.status_raw === '已排期')
      .sort(byVisit)
      .map((r) => ({ ...item(r), is_today: r.visit_date === today, is_tomorrow: r.visit_date === tomorrow })),
    reply_needed: rows.filter((r) => r.status_raw === '等我们回').sort(byStale).map(item),
    set_time: rows.filter((r) => r.status_raw === '已敲定待约时间').sort(byStale).map(item),
    to_post: rows.filter((r) => ['已到店', '待发 reel', '待发帖'].includes(r.status_raw)).sort(byVisit).map(item),
    unpaid: rows.filter((r) => r.amount > 0 && !r.paid).sort(byStale).map(item),
  };

  const nowDow = new Date(new Date().toLocaleString('en-US', { timeZone: TZ })).getDay();
  const daysToSun = nowDow === 0 ? 0 : 7 - nowDow;
  const weekEnd = ymd(new Date(Date.now() + daysToSun * 86400000));
  const byTime = (a: any, b: any) => byVisit(a, b) || (a.visit_time || '99:99').localeCompare(b.visit_time || '99:99');
  const arrivalRows = rows
    .filter((r) => r.visit_date && r.bucket !== 'declined' && r.visit_date >= today && r.visit_date <= weekEnd)
    .sort(byTime);
  const arrivals = {
    week_end: weekEnd,
    today: arrivalRows.filter((r) => r.visit_date === today).map(item),
    tomorrow: arrivalRows.filter((r) => r.visit_date === tomorrow).map(item),
    later: arrivalRows.filter((r) => r.visit_date > tomorrow).map(item),
  };

  const published = rows.filter((r) => r.bucket === 'published').sort((a, b) => (b.pub_date || '').localeCompare(a.pub_date || '')).map(item);

  const owed = rows.filter((r) => r.amount > 0);
  const payments = {
    paid: owed.filter((r) => r.paid).length,
    unpaid: owed.filter((r) => !r.paid).length,
    unpaid_total: owed.filter((r) => !r.paid).reduce((s, r) => s + (r.amount || 0), 0),
  };

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

  const lastSync = (db.prepare(`SELECT MAX(updated_at) m FROM ig_funnel`).get() as any)?.m || null;

  const m = metrics;
  const funnelBar = [
    { key: 'talking', label: 'In Discussion', count: m.talking + m.scheduled + m.visited + m.published },
    { key: 'scheduled', label: 'Scheduled', count: m.scheduled + m.visited + m.published },
    { key: 'visited', label: 'Visited', count: m.visited + m.published },
    { key: 'published', label: 'Published', count: m.published },
  ];

  res.json({
    ready: true, order: FUNNEL_ORDER, labels: FUNNEL_LABELS,
    total: rows.length, metrics, declined, todos, arrivals, published, payments, byRestaurant, unassigned, restaurants, lastSync, funnelBar,
  });
});

export default router;
