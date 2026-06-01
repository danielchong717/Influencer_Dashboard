/**
 * Dev seed — creates server/data/dev_dashboard.db with rich dummy data
 * for testing all tabs without touching the real database.
 *
 * Run:  npm run seed:dev   (from server/ directory)
 * Use:  set DB_PATH=./data/dev_dashboard.db in .env, then restart server
 * Swap back: set DB_PATH=./data/real_dashboard.db
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const dbPath = path.resolve(__dirname, '../../data/dev_dashboard.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

// Wipe and recreate for a clean slate every time
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
[`${dbPath}-shm`, `${dbPath}-wal`].forEach(f => { if (fs.existsSync(f)) fs.unlinkSync(f); });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema (mirror of index.ts) ────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS team_members (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    gmail_refresh_token TEXT, gmail_access_token TEXT, gmail_token_expiry TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, start_date TEXT, end_date TEXT,
    budget REAL DEFAULT 0, status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS influencers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, platform TEXT NOT NULL,
    username TEXT, email TEXT, followers INTEGER DEFAULT 0,
    category TEXT, country TEXT, avatar_url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS email_templates (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS outreach (
    id TEXT PRIMARY KEY, influencer_id TEXT NOT NULL, campaign_id TEXT NOT NULL,
    team_member_id TEXT NOT NULL, status TEXT DEFAULT 'pending',
    email_template_id TEXT, sent_at TEXT, opened_at TEXT, replied_at TEXT,
    follow_up_date TEXT, follow_up_sent INTEGER DEFAULT 0, notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (influencer_id) REFERENCES influencers(id),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
    FOREIGN KEY (team_member_id) REFERENCES team_members(id)
  );
  CREATE TABLE IF NOT EXISTS pipeline (
    id TEXT PRIMARY KEY, influencer_id TEXT NOT NULL, campaign_id TEXT NOT NULL,
    team_member_id TEXT NOT NULL, stage TEXT NOT NULL DEFAULT 'confirmed',
    publication_date TEXT, is_overdue INTEGER DEFAULT 0, position INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (influencer_id) REFERENCES influencers(id),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
    FOREIGN KEY (team_member_id) REFERENCES team_members(id)
  );
  CREATE TABLE IF NOT EXISTS content_schedule (
    id TEXT PRIMARY KEY, influencer_id TEXT NOT NULL, campaign_id TEXT NOT NULL,
    scheduled_date TEXT NOT NULL, platform TEXT NOT NULL, content_type TEXT DEFAULT 'video',
    video_url TEXT, status TEXT DEFAULT 'scheduled',
    views_24h INTEGER, views_7d INTEGER, likes INTEGER, comments INTEGER,
    engagement_rate REAL, shares INTEGER, price REAL DEFAULT 0, published_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (influencer_id) REFERENCES influencers(id),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
  );
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY, influencer_id TEXT NOT NULL, campaign_id TEXT NOT NULL,
    amount REAL NOT NULL, currency TEXT DEFAULT 'USD', status TEXT DEFAULT 'pending',
    payment_method TEXT, payment_date TEXT, confirmation_sent INTEGER DEFAULT 0,
    notes TEXT, created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (influencer_id) REFERENCES influencers(id),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
  );
  CREATE TABLE IF NOT EXISTS performance (
    id TEXT PRIMARY KEY, influencer_id TEXT NOT NULL, campaign_id TEXT NOT NULL,
    cpm REAL, views_24h INTEGER, views_7d INTEGER, engagement_rate REAL,
    total_score REAL, ranking INTEGER, registrations INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (influencer_id) REFERENCES influencers(id),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
  );
  CREATE TABLE IF NOT EXISTS long_term_partners (
    id TEXT PRIMARY KEY, influencer_id TEXT NOT NULL UNIQUE,
    start_date TEXT NOT NULL, end_date TEXT NOT NULL,
    monthly_rate REAL DEFAULT 0, total_spend REAL DEFAULT 0,
    content_count INTEGER DEFAULT 0, avg_score REAL DEFAULT 0,
    status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (influencer_id) REFERENCES influencers(id)
  );
`);

// ── Team members ───────────────────────────────────────────────────────────
const danielId = uuidv4();
const johnId = uuidv4();
db.prepare('INSERT INTO team_members (id, name, email) VALUES (?, ?, ?)').run(danielId, 'Daniel Chong', 'danielchonggoonhin@gmail.com');
db.prepare('INSERT INTO team_members (id, name, email) VALUES (?, ?, ?)').run(johnId, 'John Doe', 'saintan717@gmail.com');

// ── Campaign ───────────────────────────────────────────────────────────────
const campaignId = uuidv4();
db.prepare('INSERT INTO campaigns (id, name, start_date, end_date, budget, status) VALUES (?, ?, ?, ?, ?, ?)')
  .run(campaignId, 'Spring 2026 Campaign', '2026-05-01', '2026-06-30', 50000, 'active');

// ── Email template ─────────────────────────────────────────────────────────
const templateId = uuidv4();
db.prepare('INSERT INTO email_templates (id, name, subject, body) VALUES (?, ?, ?, ?)').run(
  templateId, 'Initial Outreach', 'Collaboration Opportunity with Ji Bei Chuan',
  `Hi {{name}},\n\nI hope this message finds you well! My name is {{sender_name}} from Ji Bei Chuan...`
);

// ── Influencers ────────────────────────────────────────────────────────────
const influencers = [
  { id: uuidv4(), name: 'G Loh',        platform: 'TikTok',    username: '@gordonloh712',  email: 'testinfluencer01@gmail.com',  followers: 82000,  category: 'Food',      country: 'MY' },
  { id: uuidv4(), name: 'Sarah Tan',    platform: 'Instagram', username: '@sarahtan_eats', email: 'testinfluencer02@gmail.com',  followers: 145000, category: 'Lifestyle', country: 'MY' },
  { id: uuidv4(), name: 'KL Foodie',    platform: 'YouTube',   username: 'KLFoodieCh',     email: 'testinfluencer03@gmail.com',  followers: 310000, category: 'Food',      country: 'MY' },
  { id: uuidv4(), name: 'Mei Zhen',     platform: 'RedNote',   username: '@meizhen_food',  email: 'testinfluencer04@gmail.com',  followers: 56000,  category: 'Food',      country: 'MY' },
  { id: uuidv4(), name: 'Aaron Lim',    platform: 'TikTok',    username: '@aaronlimkl',    email: 'testinfluencer05@gmail.com',  followers: 220000, category: 'Lifestyle', country: 'MY' },
];
const ins = db.prepare('INSERT INTO influencers (id, name, platform, username, email, followers, category, country) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
influencers.forEach(i => ins.run(i.id, i.name, i.platform, i.username, i.email, i.followers, i.category, i.country));

// ── Outreach records (spread across statuses for testing) ─────────────────
const statuses = ['confirmed', 'replied', 'opened', 'sent', 'pending'];
const members  = [danielId, johnId, danielId, johnId, danielId];
const now = new Date();

influencers.forEach((inf, idx) => {
  const status = statuses[idx];
  const sentAt = status !== 'pending' ? new Date(now.getTime() - (5 - idx) * 86400000).toISOString() : null;
  const openedAt = ['confirmed','replied','opened'].includes(status) ? new Date(now.getTime() - (4 - idx) * 86400000).toISOString() : null;
  const repliedAt = ['confirmed','replied'].includes(status) ? new Date(now.getTime() - (3 - idx) * 86400000).toISOString() : null;
  const followUpDate = status === 'sent' ? new Date(now.getTime() + 2 * 86400000).toISOString().split('T')[0] : null;

  const outreachId = uuidv4();
  db.prepare(`INSERT INTO outreach (id, influencer_id, campaign_id, team_member_id, status, email_template_id, sent_at, opened_at, replied_at, follow_up_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(outreachId, inf.id, campaignId, members[idx], status, templateId, sentAt, openedAt, repliedAt, followUpDate);
});

// ── Pipeline cards (all 5 influencers across different stages) ───────────
const pipelineStages = ['creating_video', 'brief_sent', 'scheduled', 'confirmed', 'confirmed'];
influencers.forEach((inf, idx) => {
  const pubDate = new Date(now.getTime() + (7 + idx * 5) * 86400000).toISOString().split('T')[0];
  db.prepare('INSERT INTO pipeline (id, influencer_id, campaign_id, team_member_id, stage, publication_date, position) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), inf.id, campaignId, members[idx % members.length], pipelineStages[idx], pubDate, idx + 1);
});

// ── Content schedule (all 5 published with YouTube links + metrics) ───────
const content = [
  { inf: influencers[0], videoUrl: 'https://www.youtube.com/watch?v=fJdVw_xnT0c', views24: 4800,  views7d: 5200,  likes: 310,  comments: 28, shares: 14, engagement: 6.8, price: 1500 },
  { inf: influencers[1], videoUrl: 'https://www.youtube.com/watch?v=dWHugRFW6R8', views24: 5100,  views7d: 5600,  likes: 290,  comments: 31, shares: 12, engagement: 6.0, price: 2800 },
  { inf: influencers[2], videoUrl: 'https://www.youtube.com/watch?v=d-YTlCbBMgs', views24: 4500,  views7d: 4900,  likes: 380,  comments: 44, shares: 18, engagement: 8.9, price: 3500 },
  { inf: influencers[3], videoUrl: 'https://www.youtube.com/watch?v=ci-5DdE6dw8', views24: 5800,  views7d: 6100,  likes: 210,  comments: 19, shares: 9,  engagement: 3.9, price: 1200 },
  { inf: influencers[4], videoUrl: 'https://www.youtube.com/watch?v=l4UjsJVOcSM', views24: 4200,  views7d: 4700,  likes: 260,  comments: 22, shares: 11, engagement: 6.2, price: 2200 },
];
content.forEach((c, idx) => {
  const schedDate = new Date(now.getTime() - (14 - idx * 3) * 86400000).toISOString().split('T')[0];
  db.prepare(`INSERT INTO content_schedule (id, influencer_id, campaign_id, scheduled_date, platform, content_type, video_url, status, views_24h, views_7d, likes, comments, shares, engagement_rate, price, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(uuidv4(), c.inf.id, campaignId, schedDate, c.inf.platform, 'video', c.videoUrl, 'published',
      c.views24, c.views7d, c.likes, c.comments, c.shares, c.engagement, c.price, schedDate);
});

// ── Payments ───────────────────────────────────────────────────────────────
const payments = [
  { inf: influencers[0], amount: 1500, status: 'paid',    date: new Date(now.getTime() - 3 * 86400000).toISOString() },
  { inf: influencers[1], amount: 2800, status: 'paid',    date: new Date(now.getTime() - 1 * 86400000).toISOString() },
  { inf: influencers[2], amount: 3500, status: 'pending', date: null },
  { inf: influencers[3], amount: 1200, status: 'pending', date: null },
  { inf: influencers[4], amount: 2200, status: 'pending', date: null },
];
payments.forEach(p => {
  db.prepare('INSERT INTO payments (id, influencer_id, campaign_id, amount, currency, status, payment_date, confirmation_sent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), p.inf.id, campaignId, p.amount, 'USD', p.status, p.date, p.status === 'paid' ? 1 : 0);
});

db.close();
console.log(`\nDev database created at: ${dbPath}`);
console.log('\nInfluencers seeded:');
influencers.forEach((inf, i) => console.log(`  ${inf.name.padEnd(12)} — outreach: ${statuses[i]}`));
console.log('\nTo use it: set DB_PATH=./data/dev_dashboard.db in .env and restart the server.');
console.log('To switch back: set DB_PATH=./data/real_dashboard.db\n');
