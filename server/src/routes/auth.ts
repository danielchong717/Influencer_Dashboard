import { Router } from 'express';
import { getAuthUrl, exchangeCodeForTokens, isGmailConnected, getConnectedMembers } from '../services/gmail';
import db from '../db';

const router = Router();

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
