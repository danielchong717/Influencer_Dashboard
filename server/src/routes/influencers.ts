import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';

const router = Router();

router.get('/', (req, res) => {
  const { platform, category, search } = req.query as Record<string, string>;
  let query = 'SELECT * FROM influencers WHERE 1=1';
  const params: string[] = [];
  if (platform) { query += ' AND platform = ?'; params.push(platform); }
  if (category) { query += ' AND category = ?'; params.push(category); }
  if (search) { query += ' AND (name LIKE ? OR username LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  query += ' ORDER BY created_at DESC';
  const influencers = db.prepare(query).all(...params);
  res.json(influencers);
});

router.get('/:id', (req, res) => {
  const inf = db.prepare('SELECT * FROM influencers WHERE id = ?').get(req.params.id);
  if (!inf) return res.status(404).json({ error: 'Not found' });
  res.json(inf);
});

router.post('/', (req, res) => {
  const { name, platform, username, email, followers, category, country } = req.body;
  if (!name || !platform) return res.status(400).json({ error: 'name and platform are required' });
  const id = uuidv4();
  db.prepare(`INSERT INTO influencers (id, name, platform, username, email, followers, category, country) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, name, platform, username, email, followers || 0, category, country);
  const created = db.prepare('SELECT * FROM influencers WHERE id = ?').get(id);
  res.status(201).json(created);
});

router.put('/:id', (req, res) => {
  const { name, platform, username, email, followers, category, country } = req.body;
  db.prepare(`UPDATE influencers SET name=?, platform=?, username=?, email=?, followers=?, category=?, country=? WHERE id=?`).run(name, platform, username, email, followers, category, country, req.params.id);
  const updated = db.prepare('SELECT * FROM influencers WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const id = req.params.id;
  // Delete all related records first to avoid FK constraint errors
  db.prepare('DELETE FROM outreach WHERE influencer_id = ?').run(id);
  db.prepare('DELETE FROM pipeline WHERE influencer_id = ?').run(id);
  db.prepare('DELETE FROM content_schedule WHERE influencer_id = ?').run(id);
  db.prepare('DELETE FROM payments WHERE influencer_id = ?').run(id);
  db.prepare('DELETE FROM long_term_partners WHERE influencer_id = ?').run(id);
  db.prepare('DELETE FROM influencers WHERE id = ?').run(id);
  res.json({ success: true });
});

export default router;
