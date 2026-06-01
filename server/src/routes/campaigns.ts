import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';

const router = Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all());
});

router.post('/', (req, res) => {
  const { name, start_date, end_date, budget, status } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const id = uuidv4();
  db.prepare(`INSERT INTO campaigns (id, name, start_date, end_date, budget, status) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, name, start_date || null, end_date || null, budget || 0, status || 'active');
  res.status(201).json(db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id));
});

router.put('/:id', (req, res) => {
  const { name, start_date, end_date, budget, status } = req.body;
  db.prepare(`UPDATE campaigns SET name=?, start_date=?, end_date=?, budget=?, status=? WHERE id=?`)
    .run(name, start_date || null, end_date || null, budget || 0, status, req.params.id);
  res.json(db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
