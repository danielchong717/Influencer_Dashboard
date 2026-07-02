import { Router } from 'express';
import crypto from 'crypto';
import { getAuthUrl, exchangeCodeForTokens, isGmailConnected, getConnectedMembers } from '../services/gmail';
import db from '../db';

function makeToken(password: string, email: string) {
  return crypto.createHash('sha256').update(password + email + 'influencer-dash').digest('hex');
}

const router = Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  const adminEmail = process.env.ADMIN_EMAIL || 'danielchonggoonhin@gmail.com';

  // If no password set (local dev), auto-approve
  if (!adminPassword) return res.json({ token: 'dev' });

  const { email, password } = req.body;
  if (email !== adminEmail || password !== adminPassword) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  res.json({ token: makeToken(adminPassword, adminEmail) });
});

// GET /api/auth/verify
router.get('/verify', (req, res) => {
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  const adminEmail = process.env.ADMIN_EMAIL || 'danielchonggoonhin@gmail.com';

  if (!adminPassword) return res.json({ valid: true }); // local dev — no auth required

  const token = req.headers['x-auth-token'] as string;
  res.json({ valid: token === makeToken(adminPassword, adminEmail) });
});

// Pass team_member_id as query param so the OAuth state carries it through the flow
router.get('/gmail/url', (req, res) => {
  const { team_member_id } = req.query as { team_member_id?: string };
  const url = getAuthUrl(team_member_id);
  res.json({ url });
});

router.get('/gmail/callback', async (req, res) => {
  const { code, state } = req.query as { code: string; state?: string };
  if (!code) {
    return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}?gmail_error=no_code`);
  }

  try {
    const firstMember = db.prepare('SELECT id FROM team_members LIMIT 1').get() as any;
    const teamMemberId = state || firstMember?.id;
    if (!teamMemberId) throw new Error('No team member found');

    const result = await exchangeCodeForTokens(code, teamMemberId);
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}?gmail_connected=true&email=${result.email}`);
  } catch (err: any) {
    console.error('Gmail OAuth error:', err);
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}?gmail_error=${encodeURIComponent(err.message)}`);
  }
});

// Returns overall connected status + per-member list
router.get('/gmail/status', (req, res) => {
  const connected = isGmailConnected();
  const member = connected
    ? (db.prepare('SELECT id, name, email FROM team_members WHERE gmail_refresh_token IS NOT NULL LIMIT 1').get() as any)
    : null;
  const connectedMembers = getConnectedMembers();
  res.json({ connected, member, connectedMembers });
});

// Disconnect a specific team member's Gmail (or all if no id)
router.delete('/gmail', (req, res) => {
  const { team_member_id } = req.query as { team_member_id?: string };
  if (team_member_id) {
    db.prepare('UPDATE team_members SET gmail_refresh_token = NULL, gmail_access_token = NULL, gmail_token_expiry = NULL WHERE id = ?').run(team_member_id);
  } else {
    db.prepare('UPDATE team_members SET gmail_refresh_token = NULL, gmail_access_token = NULL, gmail_token_expiry = NULL').run();
  }
  res.json({ success: true });
});

router.get('/team-members', (req, res) => {
  const members = db.prepare('SELECT id, name, email FROM team_members').all();
  res.json(members);
});

export default router;
