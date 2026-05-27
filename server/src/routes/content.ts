import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';

const router = Router();

router.get('/', (req, res) => {
  const { campaign_id } = req.query as { campaign_id?: string };
  let query = `
    SELECT cs.*, i.name as influencer_name, i.username, i.platform as influencer_platform, i.email as influencer_email,
           tm.name as team_member_name, c.name as campaign_name
    FROM content_schedule cs
    JOIN influencers i ON cs.influencer_id = i.id
    JOIN campaigns c ON cs.campaign_id = c.id
    LEFT JOIN pipeline p ON p.influencer_id = cs.influencer_id AND p.campaign_id = cs.campaign_id
    LEFT JOIN team_members tm ON p.team_member_id = tm.id
    WHERE 1=1
  `;
  const params: string[] = [];
  if (campaign_id) { query += ' AND cs.campaign_id = ?'; params.push(campaign_id); }
  query += ' ORDER BY cs.scheduled_date ASC';
  res.json(db.prepare(query).all(...params));
});

router.post('/', (req, res) => {
  const { influencer_id, campaign_id, scheduled_date, platform, content_type, price } = req.body;
  const id = uuidv4();
  db.prepare(`INSERT INTO content_schedule (id, influencer_id, campaign_id, scheduled_date, platform, content_type, price) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, influencer_id, campaign_id, scheduled_date, platform, content_type || 'video', price || 0);
  res.status(201).json(db.prepare('SELECT * FROM content_schedule WHERE id = ?').get(id));
});

router.put('/:id/video', (req, res) => {
  const { video_url } = req.body;
  const now = new Date().toISOString();
  db.prepare('UPDATE content_schedule SET video_url = ?, status = ?, published_at = ? WHERE id = ?')
    .run(video_url, 'published', now, req.params.id);

  setTimeout(() => {
    const views24 = Math.floor(Math.random() * 600000) + 30000;
    const views7d = Math.floor(views24 * (Math.random() * 3 + 1.5));
    const likes = Math.floor(views24 * (Math.random() * 0.08 + 0.02));
    const comments = Math.floor(likes * (Math.random() * 0.15 + 0.05));
    const shares = Math.floor(likes * 0.06);
    const engagement = parseFloat(((likes + comments + shares) / views7d * 100).toFixed(2));

    db.prepare(`UPDATE content_schedule SET views_24h=?, views_7d=?, likes=?, comments=?, shares=?, engagement_rate=? WHERE id=?`)
      .run(views24, views7d, likes, comments, shares, engagement, req.params.id);
  }, 1000);

  res.json({ success: true, video_url });
});

router.post('/:id/fetch-metrics', (req, res) => {
  const views24 = Math.floor(Math.random() * 600000) + 30000;
  const views7d = Math.floor(views24 * (Math.random() * 3 + 1.5));
  const likes = Math.floor(views24 * (Math.random() * 0.08 + 0.02));
  const comments = Math.floor(likes * (Math.random() * 0.15 + 0.05));
  const shares = Math.floor(likes * 0.06);
  const engagement = parseFloat(((likes + comments + shares) / views7d * 100).toFixed(2));

  db.prepare(`UPDATE content_schedule SET views_24h=?, views_7d=?, likes=?, comments=?, shares=?, engagement_rate=? WHERE id=?`)
    .run(views24, views7d, likes, comments, shares, engagement, req.params.id);

  const updated = db.prepare('SELECT * FROM content_schedule WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.put('/:id', (req, res) => {
  const { scheduled_date, platform, content_type, price, status } = req.body;
  db.prepare('UPDATE content_schedule SET scheduled_date=?, platform=?, content_type=?, price=?, status=? WHERE id=?')
    .run(scheduled_date, platform, content_type, price, status, req.params.id);
  res.json(db.prepare('SELECT * FROM content_schedule WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM content_schedule WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
