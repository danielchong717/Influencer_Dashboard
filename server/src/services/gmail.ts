import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import db from '../db';
import dotenv from 'dotenv';

dotenv.config();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/gmail/callback';

export const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

export const getAuthUrl = (): string => {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://mail.google.com/',
    ],
    prompt: 'consent',
  });
};

export const exchangeCodeForTokens = async (code: string, teamMemberId: string) => {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  db.prepare(`UPDATE team_members SET gmail_refresh_token = ?, gmail_access_token = ?, gmail_token_expiry = ? WHERE id = ?`).run(
    tokens.refresh_token || null,
    tokens.access_token || null,
    tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    teamMemberId
  );

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const profile = await gmail.users.getProfile({ userId: 'me' });
  return { email: profile.data.emailAddress, tokens };
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
}): Promise<boolean> => {
  try {
    const gmail = await getGmailClient(params.teamMemberId);
    if (!gmail) throw new Error('Gmail not connected');

    const message = [
      `To: ${params.to}`,
      `Subject: ${params.subject}`,
      `Content-Type: text/html; charset=utf-8`,
      `MIME-Version: 1.0`,
      ``,
      params.body,
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
