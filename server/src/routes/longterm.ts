import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';

const router = Router();

router.get('/', (req, res) => {
  const partners = db.prepare(`
    SELECT lp.*, i.name as influencer_name, i.platform, i.username, i.followers, i.category, i.email as influencer_email,
           perf.total_score as latest_score, perf.engagement_rate, perf.views_7d
    FROM long_term_partners lp
    JOIN influencers i ON lp.influencer_id = i.id
    LEFT JOIN performance perf ON perf.influencer_id = i.id
    ORDER BY lp.created_at DESC
  `).all();
  res.json(partners);
});

router.post('/', (req, res) => {
  const { influencer_id, start_date, end_date, monthly_rate } = req.body;
  if (!influencer_id || !start_date || !end_date) {
    return res.status(400).json({ error: 'influencer_id, start_date, end_date are required' });
  }

  const existing = db.prepare('SELECT id FROM long_term_partners WHERE influencer_id = ?').get(influencer_id);
  if (existing) {
    db.prepare('UPDATE long_term_partners SET start_date=?, end_date=?, monthly_rate=?, status=? WHERE influencer_id=?')
      .run(start_date, end_date, monthly_rate || 0, 'active', influencer_id);
    const updated = db.prepare(`
      SELECT lp.*, i.name as influencer_name, i.platform, i.username
      FROM long_term_partners lp JOIN influencers i ON lp.influencer_id = i.id
      WHERE lp.influencer_id = ?
    `).get(influencer_id);
    return res.json(updated);
  }

  const id = uuidv4();
  const months = Math.ceil((new Date(end_date).getTime() - new Date(start_date).getTime()) / (1000 * 60 * 60 * 24 * 30));
  const totalSpend = (monthly_rate || 0) * months;

  db.prepare(`INSERT INTO long_term_partners (id, influencer_id, start_date, end_date, monthly_rate, total_spend, status) VALUES (?, ?, ?, ?, ?, ?, 'active')`)
    .run(id, influencer_id, start_date, end_date, monthly_rate || 0, totalSpend);

  const created = db.prepare(`
    SELECT lp.*, i.name as influencer_name, i.platform, i.username, i.followers, i.category
    FROM long_term_partners lp JOIN influencers i ON lp.influencer_id = i.id WHERE lp.id = ?
  `).get(id);
  res.status(201).json(created);
});

router.put('/:id', (req, res) => {
  const { start_date, end_date, monthly_rate, status, content_count, avg_score } = req.body;
  db.prepare(`UPDATE long_term_partners SET start_date=?, end_date=?, monthly_rate=?, status=?, content_count=?, avg_score=? WHERE id=?`)
    .run(start_date, end_date, monthly_rate, status, content_count, avg_score, req.params.id);
  res.json(db.prepare('SELECT * FROM long_term_partners WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM long_term_partners WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
