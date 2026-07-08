import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';

const router = Router();

router.get('/', (req, res) => {
  const { campaign_id, team_member_id, status } = req.query as Record<string, string>;

  // Start from influencers so ALL influencers appear, even without outreach records
  let query = `
    SELECT
      i.id as influencer_id, i.name as influencer_name, i.platform, i.email as influencer_email,
      i.username, i.followers, i.category, i.country,
      o.id, o.campaign_id, o.team_member_id, o.status, o.email_template_id,
      o.sent_at, o.opened_at, o.replied_at, o.follow_up_date, o.follow_up_sent, o.notes, o.created_at,
      COALESCE(tm.name, '—') as team_member_name,
      COALESCE(c.name, '') as campaign_name,
      et.subject as template_subject
    FROM influencers i
    LEFT JOIN outreach o ON o.influencer_id = i.id ${campaign_id ? 'AND o.campaign_id = ?' : ''}
    LEFT JOIN team_members tm ON o.team_member_id = tm.id
    LEFT JOIN campaigns c ON o.campaign_id = c.id
    LEFT JOIN email_templates et ON o.email_template_id = et.id
    WHERE 1=1
  `;
  const params: string[] = [];
  if (campaign_id) params.push(campaign_id);
  if (team_member_id) { query += ' AND o.team_member_id = ?'; params.push(team_member_id); }
  if (status) { query += ' AND o.status = ?'; params.push(status); }
  query += ' ORDER BY i.created_at DESC';

  const rows = db.prepare(query).all(...params) as any[];
  // Fill in default status for influencers with no outreach record
  const result = rows.map(r => ({ ...r, status: r.status || 'added' }));
  res.json(result);
});

router.get('/analytics', (req, res) => {
  const { campaign_id } = req.query as { campaign_id?: string };
  const params = campaign_id ? [campaign_id] : [];

  const stats = db.prepare(`
    SELECT
      tm.id, tm.name, tm.email,
      COUNT(o.id) as total_sent,
      SUM(CASE WHEN o.status IN ('opened','replied','confirmed') THEN 1 ELSE 0 END) as total_opened,
      SUM(CASE WHEN o.status IN ('replied','confirmed') THEN 1 ELSE 0 END) as total_replied,
      SUM(CASE WHEN o.status = 'confirmed' THEN 1 ELSE 0 END) as total_confirmed
    FROM team_members tm
    LEFT JOIN outreach o ON o.team_member_id = tm.id ${campaign_id ? 'AND o.campaign_id = ?' : ''}
    GROUP BY tm.id, tm.name
  `).all(...params);

  const totals = stats.reduce((acc: any, s: any) => ({
    total_sent: acc.total_sent + (s.total_sent || 0),
    total_opened: acc.total_opened + (s.total_opened || 0),
    total_replied: acc.total_replied + (s.total_replied || 0),
    total_confirmed: acc.total_confirmed + (s.total_confirmed || 0),
  }), { total_sent: 0, total_opened: 0, total_replied: 0, total_confirmed: 0 });

  res.json({ by_member: stats, totals });
});

router.get('/discover', (req, res) => {
  const { platform = 'Instagram', min_followers = '500', max_followers = '4000', min_avg_views = '0' } = req.query as Record<string, string>;

  let query = `SELECT * FROM influencers WHERE platform = ? AND followers BETWEEN ? AND ?`;
  const params: any[] = [platform, Number(min_followers), Number(max_followers)];

  if (Number(min_avg_views) > 0) {
    query += ` AND avg_reel_views >= ?`;
    params.push(Number(min_avg_views));
  }

  query += ` ORDER BY avg_reel_views DESC, followers ASC`;
  res.json(db.prepare(query).all(...params));
});

router.get('/follow-ups', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const followUps = db.prepare(`
    SELECT o.*, i.name as influencer_name, i.email as influencer_email, i.platform,
           tm.name as team_member_name
    FROM outreach o
    JOIN influencers i ON o.influencer_id = i.id
    JOIN team_members tm ON o.team_member_id = tm.id
    WHERE o.follow_up_date <= ? AND o.follow_up_sent = 0 AND o.status = 'sent'
  `).all(today);
  res.json(followUps);
});

router.post('/send', (req, res) => {
  const { influencer_ids, campaign_id, team_member_id, template_id, follow_up_days } = req.body;
  if (!influencer_ids?.length || !campaign_id || !team_member_id) {
    return res.status(400).json({ error: 'influencer_ids, campaign_id, team_member_id are required' });
  }

  const results: any[] = [];

  for (const influencerId of influencer_ids) {
    const influencer = db.prepare('SELECT * FROM influencers WHERE id = ?').get(influencerId) as any;
    if (!influencer) continue;

    const now = new Date().toISOString();
    const followUpDate = follow_up_days
      ? new Date(Date.now() + follow_up_days * 86400000).toISOString().split('T')[0]
      : null;

    const existing = db.prepare('SELECT id FROM outreach WHERE influencer_id = ? AND campaign_id = ?').get(influencerId, campaign_id) as any;
    const outreachId = existing?.id || uuidv4();

    if (existing) {
      db.prepare(`UPDATE outreach SET status='sent', sent_at=?, follow_up_date=?, follow_up_sent=0, email_template_id=?, team_member_id=? WHERE id=?`)
        .run(now, followUpDate, template_id, team_member_id, existing.id);
      results.push({ influencer_id: influencerId, outreach_id: existing.id });
    } else {
      db.prepare(`INSERT INTO outreach (id, influencer_id, campaign_id, team_member_id, status, email_template_id, sent_at, follow_up_date) VALUES (?, ?, ?, ?, 'sent', ?, ?, ?)`)
        .run(outreachId, influencerId, campaign_id, team_member_id, template_id, now, followUpDate);
      results.push({ influencer_id: influencerId, outreach_id: outreachId });
    }
  }

  res.json({ success: true, results, dm_mode: true });
});

router.put('/:id/status', (req, res) => {
  const { status, influencer_id } = req.body;
  let { campaign_id } = req.body;
  const now = new Date().toISOString();
  let outreachId = req.params.id;

  // Fall back to first campaign if none provided
  if (!campaign_id) {
    const firstCampaign = db.prepare('SELECT id FROM campaigns LIMIT 1').get() as any;
    campaign_id = firstCampaign?.id;
  }

  // If no real outreach record exists yet (influencer added but no email sent),
  // create one on the fly so status changes and downstream automation work.
  if (outreachId === 'null' || outreachId === 'undefined' || !outreachId) {
    const existing = influencer_id
      ? db.prepare('SELECT id FROM outreach WHERE influencer_id = ?').get(influencer_id) as any
      : null;
    if (existing) {
      outreachId = existing.id;
    } else if (influencer_id && campaign_id) {
      const firstMember = db.prepare('SELECT id FROM team_members LIMIT 1').get() as any;
      outreachId = uuidv4();
      db.prepare(`INSERT INTO outreach (id, influencer_id, campaign_id, team_member_id, status) VALUES (?, ?, ?, ?, 'added')`)
        .run(outreachId, influencer_id, campaign_id, firstMember?.id || '');
    }
  }

  db.prepare(`UPDATE outreach SET status=?, opened_at=COALESCE(opened_at,?), replied_at=COALESCE(replied_at,?) WHERE id=?`)
    .run(status, status === 'opened' || status === 'replied' ? now : null, status === 'replied' ? now : null, outreachId);

  // When an influencer is confirmed, automatically create a Pipeline card so
  // the team can immediately start tracking content without any manual steps.
  let pipeline_created = false;
  if (status === 'confirmed') {
    const outreach = db.prepare('SELECT * FROM outreach WHERE id = ?').get(req.params.id) as any;
    if (outreach) {
      const existing = db.prepare(
        'SELECT id FROM pipeline WHERE influencer_id = ? AND campaign_id = ?'
      ).get(outreach.influencer_id, outreach.campaign_id);

      if (!existing) {
        const pipelineId = uuidv4();
        const maxPos = (db.prepare(
          'SELECT MAX(position) as pos FROM pipeline WHERE campaign_id = ?'
        ).get(outreach.campaign_id) as any)?.pos || 0;

        db.prepare(`
          INSERT INTO pipeline (id, influencer_id, campaign_id, team_member_id, stage, position)
          VALUES (?, ?, ?, ?, 'confirmed', ?)
        `).run(pipelineId, outreach.influencer_id, outreach.campaign_id, outreach.team_member_id, maxPos + 1);

        pipeline_created = true;
      }

      // Also auto-create a Content Schedule entry if one doesn't exist yet
      const existingContent = db.prepare(
        'SELECT id FROM content_schedule WHERE influencer_id = ? AND campaign_id = ?'
      ).get(outreach.influencer_id, outreach.campaign_id);

      if (!existingContent) {
        const influencer = db.prepare('SELECT * FROM influencers WHERE id = ?').get(outreach.influencer_id) as any;
        const scheduledDate = new Date().toISOString().split('T')[0];
        db.prepare(`
          INSERT INTO content_schedule (id, influencer_id, campaign_id, scheduled_date, platform, content_type, status, price)
          VALUES (?, ?, ?, ?, ?, 'video', 'scheduled', 0)
        `).run(uuidv4(), outreach.influencer_id, outreach.campaign_id, scheduledDate, influencer?.platform || 'TikTok');
      }
    }
  }

  res.json({ success: true, pipeline_created, outreach_id: outreachId });
});

router.post('/:id/follow-up', (req, res) => {
  const outreach = db.prepare('SELECT id FROM outreach WHERE id = ?').get(req.params.id) as any;
  if (!outreach) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE outreach SET follow_up_sent = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.get('/templates', (req, res) => {
  res.json(db.prepare('SELECT * FROM email_templates ORDER BY created_at DESC').all());
});

router.post('/templates', (req, res) => {
  const { name, subject, body } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO email_templates (id, name, subject, body) VALUES (?, ?, ?, ?)').run(id, name, subject, body);
  res.status(201).json(db.prepare('SELECT * FROM email_templates WHERE id = ?').get(id));
});

router.put('/templates/:id', (req, res) => {
  const { name, subject, body } = req.body;
  db.prepare('UPDATE email_templates SET name = ?, subject = ?, body = ? WHERE id = ?')
    .run(name, subject, body, req.params.id);
  res.json(db.prepare('SELECT * FROM email_templates WHERE id = ?').get(req.params.id));
});

router.delete('/templates/:id', (req, res) => {
  db.prepare('DELETE FROM email_templates WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
