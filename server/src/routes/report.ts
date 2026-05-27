import { Router } from 'express';
import db from '../db';

const router = Router();

router.get('/overview', (req, res) => {
  const { campaign_id } = req.query as { campaign_id?: string };
  const params = campaign_id ? [campaign_id] : [];
  const where = campaign_id ? 'WHERE campaign_id = ?' : '';

  const contentWhere = campaign_id ? 'WHERE cs.campaign_id = ?' : '';

  const metrics = db.prepare(`
    SELECT
      COUNT(*) as total_influencers,
      SUM(views_24h) as total_views_24h,
      SUM(views_7d) as total_views_7d,
      SUM(likes) as total_likes,
      SUM(comments) as total_comments,
      AVG(engagement_rate) as avg_engagement,
      SUM(registrations) as total_registrations
    FROM performance ${where}
  `).get(...params) as any;

  const totalSpend = (db.prepare(`SELECT SUM(amount) as total FROM payments WHERE status='paid' ${campaign_id ? 'AND campaign_id=?' : ''}`).get(...params) as any)?.total || 0;
  const totalViews = metrics?.total_views_7d || 1;
  const cpm = totalSpend > 0 ? parseFloat((totalSpend / totalViews * 1000).toFixed(2)) : 0;

  res.json({
    ...metrics,
    total_spend: totalSpend,
    cpm,
    open_rate: 0.68,
    reply_rate: 0.42,
  });
});

router.get('/ranking', (req, res) => {
  const { campaign_id } = req.query as { campaign_id?: string };
  const params = campaign_id ? [campaign_id, campaign_id] : [];
  const where = campaign_id ? 'AND perf.campaign_id = ?' : '';
  const payWhere = campaign_id ? 'AND pay.campaign_id = ?' : '';

  const ranking = db.prepare(`
    SELECT
      i.id, i.name, i.platform, i.username, i.followers, i.category,
      perf.cpm, perf.views_24h, perf.views_7d, perf.engagement_rate, perf.total_score, perf.registrations,
      pay.amount as payment_amount,
      ROW_NUMBER() OVER (ORDER BY perf.total_score DESC) as rank
    FROM influencers i
    JOIN performance perf ON perf.influencer_id = i.id ${where}
    LEFT JOIN payments pay ON pay.influencer_id = i.id ${payWhere}
    ORDER BY perf.total_score DESC
  `).all(...params);

  res.json(ranking);
});

router.get('/timeline', (req, res) => {
  const { campaign_id } = req.query as { campaign_id?: string };
  const params = campaign_id ? [campaign_id] : [];
  const where = campaign_id ? 'WHERE campaign_id = ?' : '';

  const published = db.prepare(`
    SELECT scheduled_date as date, SUM(views_24h) as views_24h, SUM(views_7d) as views_7d,
           SUM(likes) as likes, COUNT(*) as posts
    FROM content_schedule ${where} AND status = 'published'
    GROUP BY scheduled_date ORDER BY scheduled_date ASC
  `.replace('WHERE  AND', where ? 'WHERE' : 'WHERE 1=1 AND')).all(...params);

  res.json(published);
});

router.get('/takeaways', (req, res) => {
  const { campaign_id } = req.query as { campaign_id?: string };
  const params = campaign_id ? [campaign_id] : [];
  const where = campaign_id ? 'WHERE campaign_id = ?' : '';

  const perf = db.prepare(`SELECT * FROM performance ${where}`).all(...params) as any[];

  if (!perf.length) {
    return res.json({ takeaways: ['No performance data available yet. Add video links and fetch metrics to generate insights.'] });
  }

  const avgEngagement = perf.reduce((s, p) => s + (p.engagement_rate || 0), 0) / perf.length;
  const avgCpm = perf.reduce((s, p) => s + (p.cpm || 0), 0) / perf.length;
  const best = perf.sort((a, b) => (b.total_score || 0) - (a.total_score || 0))[0];
  const worst = [...perf].sort((a, b) => (a.total_score || 0) - (b.total_score || 0))[0];

  const bestInf = best ? (db.prepare('SELECT name, platform FROM influencers WHERE id = ?').get(best.influencer_id) as any) : null;
  const worstInf = worst ? (db.prepare('SELECT name, platform FROM influencers WHERE id = ?').get(worst.influencer_id) as any) : null;

  const takeaways = [
    `Average engagement rate across all influencers is ${avgEngagement.toFixed(1)}% — ${avgEngagement > 5 ? 'above' : 'below'} the industry benchmark of 5%.`,
    `Average CPM is $${avgCpm.toFixed(2)}. ${avgCpm < 10 ? 'Cost efficiency is strong — consider scaling up spend.' : 'CPM is high — optimize targeting or negotiate better rates.'}`,
    bestInf ? `Top performer: ${bestInf.name} (${bestInf.platform}) with a score of ${best.total_score?.toFixed(1)}. Consider signing a long-term deal.` : '',
    worstInf && worstInf.name !== bestInf?.name ? `Lowest performer: ${worstInf.name} with a score of ${worst.total_score?.toFixed(1)}. Review before continuing partnership.` : '',
    `${perf.filter(p => (p.engagement_rate || 0) > 5).length} out of ${perf.length} influencers exceeded 5% engagement. Focus next campaign budget on these high-performers.`,
  ].filter(Boolean);

  res.json({ takeaways });
});

router.get('/profile-breakdown', (req, res) => {
  const { campaign_id } = req.query as { campaign_id?: string };
  const params = campaign_id ? [campaign_id] : [];
  const where = campaign_id ? 'AND perf.campaign_id = ?' : '';

  const breakdown = db.prepare(`
    SELECT i.category, i.platform, COUNT(*) as count,
           AVG(perf.engagement_rate) as avg_engagement,
           SUM(perf.views_7d) as total_views,
           AVG(perf.cpm) as avg_cpm
    FROM influencers i
    JOIN performance perf ON perf.influencer_id = i.id ${where}
    GROUP BY i.category, i.platform
    ORDER BY total_views DESC
  `).all(...params);

  res.json(breakdown);
});

export default router;
