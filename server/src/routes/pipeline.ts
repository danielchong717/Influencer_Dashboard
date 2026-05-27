import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';

const router = Router();

const STAGES = [
  'confirmed',
  'waiting_brief',
  'brief_sent',
  'giving_feedback',
  'creating_video',
  'video_overdue',
  'scheduled',
  'published',
];

router.get('/', (req, res) => {
  const { campaign_id, team_member_id } = req.query as Record<string, string>;
  let query = `
    SELECT p.*, i.name as influencer_name, i.platform, i.username, i.followers, i.category,
           tm.name as team_member_name, c.name as campaign_name
    FROM pipeline p
    JOIN influencers i ON p.influencer_id = i.id
    JOIN team_members tm ON p.team_member_id = tm.id
    JOIN campaigns c ON p.campaign_id = c.id
    WHERE 1=1
  `;
  const params: string[] = [];
  if (campaign_id) { query += ' AND p.campaign_id = ?'; params.push(campaign_id); }
  if (team_member_id) { query += ' AND p.team_member_id = ?'; params.push(team_member_id); }
  query += ' ORDER BY p.position ASC, p.created_at ASC';

  const cards = db.prepare(query).all(...params) as any[];
  const today = new Date().toISOString().split('T')[0];

  const byStage = STAGES.reduce((acc: any, stage) => {
    acc[stage] = cards
      .filter(c => c.stage === stage)
      .map(c => ({
        ...c,
        is_overdue: c.publication_date && c.publication_date < today && !['published'].includes(c.stage) ? 1 : c.is_overdue,
      }));
    return acc;
  }, {});

  res.json({ stages: STAGES, cards: byStage, all: cards });
});

router.get('/stats', (req, res) => {
  const { campaign_id } = req.query as { campaign_id?: string };
  const params = campaign_id ? [campaign_id] : [];
  const where = campaign_id ? 'AND p.campaign_id = ?' : '';

  const stats = db.prepare(`
    SELECT tm.id, tm.name,
      COUNT(DISTINCT CASE WHEN o.status != 'pending' THEN o.influencer_id END) as total_contacts,
      COUNT(DISTINCT CASE WHEN p.stage NOT IN ('confirmed') THEN p.influencer_id END) as total_confirmed
    FROM team_members tm
    LEFT JOIN pipeline p ON p.team_member_id = tm.id ${where}
    LEFT JOIN outreach o ON o.team_member_id = tm.id ${campaign_id ? 'AND o.campaign_id = ?' : ''}
    GROUP BY tm.id, tm.name
  `).all(...params, ...params);

  res.json(stats);
});

router.put('/:id/stage', (req, res) => {
  const { stage } = req.body;
  if (!STAGES.includes(stage)) return res.status(400).json({ error: 'Invalid stage' });
  const now = new Date().toISOString();
  db.prepare('UPDATE pipeline SET stage = ?, updated_at = ? WHERE id = ?').run(stage, now, req.params.id);
  res.json(db.prepare(`
    SELECT p.*, i.name as influencer_name, i.platform, i.username, tm.name as team_member_name
    FROM pipeline p JOIN influencers i ON p.influencer_id = i.id JOIN team_members tm ON p.team_member_id = tm.id
    WHERE p.id = ?
  `).get(req.params.id));
});

router.put('/:id/date', (req, res) => {
  const { publication_date } = req.body;
  const now = new Date().toISOString();
  db.prepare('UPDATE pipeline SET publication_date = ?, updated_at = ? WHERE id = ?').run(publication_date, now, req.params.id);
  res.json({ success: true, publication_date });
});

router.post('/', (req, res) => {
  const { influencer_id, campaign_id, team_member_id, stage } = req.body;
  const id = uuidv4();
  const maxPos = (db.prepare('SELECT MAX(position) as pos FROM pipeline WHERE campaign_id = ?').get(campaign_id) as any)?.pos || 0;
  db.prepare(`INSERT INTO pipeline (id, influencer_id, campaign_id, team_member_id, stage, position) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, influencer_id, campaign_id, team_member_id, stage || 'confirmed', maxPos + 1);
  res.status(201).json(db.prepare('SELECT * FROM pipeline WHERE id = ?').get(id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM pipeline WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
