import { google } from 'googleapis';
import db from '../db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/gmail/callback';

export const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

export const getAuthUrl = (teamMemberId?: string): string => {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://mail.google.com/',
    ],
    prompt: 'consent',
    // Pass the team member ID through OAuth state so the callback knows who is connecting
    ...(teamMemberId ? { state: teamMemberId } : {}),
  });
};

export const exchangeCodeForTokens = async (code: string, fallbackTeamMemberId: string) => {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  // Get the actual Gmail address that was just authorized
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const profile = await gmail.users.getProfile({ userId: 'me' });
  const actualEmail = profile.data.emailAddress || '';

  // Store the token under the team member whose email matches the authorized Google account.
  // This prevents mismatches when the browser is logged in as a different Google account.
  const matchingMember = db.prepare('SELECT id FROM team_members WHERE email = ?').get(actualEmail) as any;
  const targetMemberId = matchingMember?.id || fallbackTeamMemberId;

  // Clear any stale token that was previously stored under this email's owner
  if (matchingMember?.id && matchingMember.id !== fallbackTeamMemberId) {
    // If the fallback ID had a token for a different account, only clear it if we're moving it
    db.prepare(`UPDATE team_members SET gmail_refresh_token = NULL, gmail_access_token = NULL, gmail_token_expiry = NULL WHERE id = ?`)
      .run(fallbackTeamMemberId);
  }

  db.prepare(`UPDATE team_members SET gmail_refresh_token = ?, gmail_access_token = ?, gmail_token_expiry = ? WHERE id = ?`).run(
    tokens.refresh_token || null,
    tokens.access_token || null,
    tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    targetMemberId
  );

  return { email: actualEmail, tokens, teamMemberId: targetMemberId };
};

export const getGmailClient = async (teamMemberId?: string) => {
  let refreshToken: string | null = null;

  if (teamMemberId) {
    const member = db.prepare('SELECT gmail_refresh_token FROM team_members WHERE id = ?').get(teamMemberId) as any;
    refreshToken = member?.gmail_refresh_token || null;
  } else {
    const member = db.prepare('SELECT gmail_refresh_token FROM team_members WHERE gmail_refresh_token IS NOT NULL LIMIT 1').get() as any;
    refreshToken = member?.gmail_refresh_token || null;
  }

  if (!refreshToken) return null;

  const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  auth.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: 'v1', auth });
};

export const sendEmail = async (params: {
  to: string;
  subject: string;
  body: string;
  teamMemberId?: string;
  trackingPixelUrl?: string;
}): Promise<boolean> => {
  try {
    const gmail = await getGmailClient(params.teamMemberId);
    if (!gmail) throw new Error('Gmail not connected');

    // Append tracking pixel at the very end of the email body if a URL is provided.
    // When the influencer's email client loads this image, the server marks the email as opened.
    const bodyWithPixel = params.trackingPixelUrl
      ? `${params.body}<img src="${params.trackingPixelUrl}" width="1" height="1" style="display:none;border:0;outline:none;" alt="" />`
      : params.body;

    const encodedSubject = `=?UTF-8?B?${Buffer.from(params.subject).toString('base64')}?=`;
    const message = [
      `To: ${params.to}`,
      `Subject: ${encodedSubject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=utf-8`,
      `Content-Transfer-Encoding: quoted-printable`,
      ``,
      bodyWithPixel,
    ].join('\n');

    const encodedMessage = Buffer.from(message).toString('base64url');
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encodedMessage } });
    return true;
  } catch (err) {
    console.error('Email send failed:', err);
    return false;
  }
};

export const sendPaymentConfirmation = async (params: {
  to: string;
  influencerName: string;
  amount: number;
  currency: string;
}): Promise<boolean> => {
  const subject = `Payment Confirmation — Thank You, ${params.influencerName}!`;
  const body = `
<html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #1e293b;">Payment Confirmed ✓</h2>
  <p>Hi ${params.influencerName},</p>
  <p>We're happy to confirm that your payment of <strong>${params.currency} ${params.amount.toLocaleString()}</strong> has been processed successfully.</p>
  <p>Thank you for your collaboration with us! We truly value our partnership and look forward to working together again.</p>
  <p>If you have any questions, please don't hesitate to reach out.</p>
  <br/>
  <p>Best regards,<br/>The Marketing Team</p>
</body></html>
  `;
  return sendEmail({ to: params.to, subject, body });
};

export const isGmailConnected = (): boolean => {
  const member = db.prepare('SELECT id FROM team_members WHERE gmail_refresh_token IS NOT NULL LIMIT 1').get();
  return !!member;
};

export const getConnectedMembers = (): { id: string; name: string; email: string }[] => {
  return db.prepare('SELECT id, name, email FROM team_members WHERE gmail_refresh_token IS NOT NULL').all() as any[];
};
