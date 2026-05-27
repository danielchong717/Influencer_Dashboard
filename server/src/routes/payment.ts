import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { sendPaymentConfirmation, isGmailConnected } from '../services/gmail';

const router = Router();

router.get('/', (req, res) => {
  const { campaign_id } = req.query as { campaign_id?: string };
  let query = `
    SELECT p.*, i.name as influencer_name, i.platform, i.email as influencer_email, i.username,
           c.name as campaign_name
    FROM payments p
    JOIN influencers i ON p.influencer_id = i.id
    JOIN campaigns c ON p.campaign_id = c.id
    WHERE 1=1
  `;
  const params: string[] = [];
  if (campaign_id) { query += ' AND p.campaign_id = ?'; params.push(campaign_id); }
  query += ' ORDER BY p.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

router.get('/overview', (req, res) => {
  const { campaign_id } = req.query as { campaign_id?: string };
  const params = campaign_id ? [campaign_id] : [];
  const where = campaign_id ? 'WHERE campaign_id = ?' : '';

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_count,
      SUM(amount) as total_amount,
      SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as paid_amount,
      SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_amount,
      COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count
    FROM payments ${where}
  `).get(...params);
  res.json(stats);
});

router.post('/', (req, res) => {
  const { influencer_id, campaign_id, amount, currency, payment_method } = req.body;
  const id = uuidv4();
  db.prepare(`INSERT INTO payments (id, influencer_id, campaign_id, amount, currency, payment_method) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, influencer_id, campaign_id, amount, currency || 'USD', payment_method);
  res.status(201).json(db.prepare('SELECT * FROM payments WHERE id = ?').get(id));
});

router.put('/:id/status', async (req, res) => {
  const { status } = req.body;
  const payment = db.prepare(`
    SELECT p.*, i.name as influencer_name, i.email as influencer_email
    FROM payments p JOIN influencers i ON p.influencer_id = i.id
    WHERE p.id = ?
  `).get(req.params.id) as any;

  if (!payment) return res.status(404).json({ error: 'Payment not found' });

  const now = new Date().toISOString();
  const paymentDate = status === 'paid' ? now.split('T')[0] : null;
  db.prepare('UPDATE payments SET status = ?, payment_date = ? WHERE id = ?').run(status, paymentDate, req.params.id);

  let emailSent = false;
  if (status === 'paid' && payment.influencer_email && isGmailConnected()) {
    emailSent = await sendPaymentConfirmation({
      to: payment.influencer_email,
      influencerName: payment.influencer_name,
      amount: payment.amount,
      currency: payment.currency,
    });
    if (emailSent) {
      db.prepare('UPDATE payments SET confirmation_sent = 1 WHERE id = ?').run(req.params.id);
    }
  }

  const updated = db.prepare(`
    SELECT p.*, i.name as influencer_name, i.platform, i.email as influencer_email, i.username
    FROM payments p JOIN influencers i ON p.influencer_id = i.id WHERE p.id = ?
  `).get(req.params.id) as Record<string, unknown>;
  res.json({ ...updated, email_sent: emailSent });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM payments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
