import { Router } from 'express';
import db from '../db';
import { FUNNEL_ORDER, FUNNEL_LABELS } from '../services/feishuSync';

const router = Router();

function funnelExists(): boolean {
  return !!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='ig_funnel'`).get();
}

const item = (r: any) => ({
  chat_id: r.chat_id,
  name: r.name, handle: r.handle, restaurant: r.restaurant, status: r.status_raw, channel: r.channel,
  note: r.note, visit_date: r.visit_date, visit_time: r.visit_time, pub_date: r.pub_date,
  post_url: r.post_url, scheduled_message: r.scheduled_message, last_modified: r.last_modified,
  feishu_url: r.feishu_url, paid: !!r.paid, amount: r.amount,
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

  // To-Do action queues (these need names + context)
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const byVisit = (a: any, b: any) => (a.visit_date || '9999').localeCompare(b.visit_date || '9999');
  // stalest first: the row untouched longest floats to the top (most likely to be forgotten)
  const byStale = (a: any, b: any) => (a.last_modified || '9999').localeCompare(b.last_modified || '9999');
  const todos = {
    // ONLY 已排期 (an actual time is set) belongs here — you can't send a dated Scheduled
    // Message without a time. 已敲定待约时间 (agreed, no time yet) stays in the 沟通中 metric.
    // Soonest visit first; today/tomorrow flagged so the client can pin the day-of reminders.
    scheduled_msg: rows.filter((r) => r.status_raw === '已排期')
      .sort(byVisit)
      .map((r) => ({ ...item(r), is_today: r.visit_date === today, is_tomorrow: r.visit_date === tomorrow })),
    reply_needed: rows.filter((r) => r.status_raw === '等我们回').sort(byStale).map(item),
    // agreed to collab but no time set yet → our move is to nail down a time
    set_time: rows.filter((r) => r.status_raw === '已敲定待约时间').sort(byStale).map(item),
    to_post: rows.filter((r) => ['已到店', '待发 reel', '待发帖'].includes(r.status_raw)).sort(byVisit).map(item),
    unpaid: rows.filter((r) => r.amount > 0 && !r.paid).sort(byStale).map(item),
  };

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
    total: rows.length, metrics, declined, todos, payments, byRestaurant, unassigned, restaurants, lastSync, funnelBar,
  });
});

export default router;
