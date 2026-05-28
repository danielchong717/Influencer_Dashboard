import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { sendEmail, isGmailConnected } from '../services/gmail';

const router = Router();

router.get('/', (req, res) => {
  const { campaign_id, team_member_id, status } = req.query as Record<string, string>;

  // Start from influencers so ALL influencers appear, even without outreach records
  let query = `
    SELECT
      i.id as influencer_id, i.name as influencer_name, i.platform, i.email as influencer_email,
      i.username, i.followers,
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
  const result = rows.map(r => ({ ...r, status: r.status || 'pending' }));
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

router.post('/send', async (req, res) => {
  const { influencer_ids, campaign_id, team_member_id, template_id, follow_up_days } = req.body;
  if (!influencer_ids?.length || !campaign_id || !team_member_id) {
    return res.status(400).json({ error: 'influencer_ids, campaign_id, team_member_id are required' });
  }

  const template = db.prepare('SELECT * FROM email_templates WHERE id = ?').get(template_id) as any;
  const sender = db.prepare('SELECT * FROM team_members WHERE id = ?').get(team_member_id) as any;
  const connected = isGmailConnected();
  const results: any[] = [];

  for (const influencerId of influencer_ids) {
    const influencer = db.prepare('SELECT * FROM influencers WHERE id = ?').get(influencerId) as any;
    if (!influencer) continue;

    let subject = template?.subject || 'Collaboration Opportunity';
    let body = template?.body || `Hi ${influencer.name}, we'd love to collaborate with you!`;
    body = body.replace(/\{\{name\}\}/g, influencer.name)
               .replace(/\{\{platform\}\}/g, influencer.platform)
               .replace(/\{\{sender_name\}\}/g, sender?.name || 'Our Team');
    body = body.replace(/\n/g, '<br>');

    let emailSent = false;
    if (connected && influencer.email) {
      emailSent = await sendEmail({ to: influencer.email, subject, body, teamMemberId: team_member_id });
    }

    const now = new Date().toISOString();
    const followUpDate = follow_up_days
      ? new Date(Date.now() + follow_up_days * 86400000).toISOString().split('T')[0]
      : null;

    const existing = db.prepare('SELECT id FROM outreach WHERE influencer_id = ? AND campaign_id = ?').get(influencerId, campaign_id) as any;
    if (existing) {
      db.prepare(`UPDATE outreach SET status='sent', sent_at=?, follow_up_date=?, follow_up_sent=0, email_template_id=?, team_member_id=? WHERE id=?`)
        .run(now, followUpDate, template_id, team_member_id, existing.id);
      results.push({ influencer_id: influencerId, outreach_id: existing.id, email_sent: emailSent });
    } else {
      const id = uuidv4();
      db.prepare(`INSERT INTO outreach (id, influencer_id, campaign_id, team_member_id, status, email_template_id, sent_at, follow_up_date) VALUES (?, ?, ?, ?, 'sent', ?, ?, ?)`)
        .run(id, influencerId, campaign_id, team_member_id, template_id, now, followUpDate);
      results.push({ influencer_id: influencerId, outreach_id: id, email_sent: emailSent });
    }
  }

  res.json({ success: true, results, gmail_connected: connected });
});

router.put('/:id/status', (req, res) => {
  const { status } = req.body;
  const now = new Date().toISOString();
  const updates: any = { status };
  if (status === 'opened' && !db.prepare('SELECT opened_at FROM outreach WHERE id=?').get(req.params.id)) {
    updates.opened_at = now;
  }
  if (status === 'replied') updates.replied_at = now;

  db.prepare(`UPDATE outreach SET status=?, opened_at=COALESCE(opened_at,?), replied_at=COALESCE(replied_at,?) WHERE id=?`)
    .run(status, status === 'opened' || status === 'replied' ? now : null, status === 'replied' ? now : null, req.params.id);
  res.json({ success: true });
});

router.post('/:id/follow-up', async (req, res) => {
  const outreach = db.prepare(`
    SELECT o.*, i.name as influencer_name, i.email as influencer_email, et.subject, et.body
    FROM outreach o
    JOIN influencers i ON o.influencer_id = i.id
    LEFT JOIN email_templates et ON o.email_template_id = et.id
    WHERE o.id = ?
  `).get(req.params.id) as any;

  if (!outreach) return res.status(404).json({ error: 'Not found' });

  const subject = `Following up: ${outreach.subject || 'Collaboration Opportunity with Ji Bei Chuan'}`;
  const body = `Hi ${outreach.influencer_name},<br><br>Just following up on my previous email. Would love to connect!<br><br>Best regards`;

  const sent = await sendEmail({ to: outreach.influencer_email, subject, body });
  db.prepare('UPDATE outreach SET follow_up_sent = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: sent });
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

export default router;
