import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../../data/dashboard.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
// on-demand "refresh = live Feishu pull" can race the hourly launchd sync (separate process,
// same db). WAL + a busy timeout lets the writer wait briefly instead of throwing SQLITE_BUSY.
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS team_members (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    gmail_refresh_token TEXT,
    gmail_access_token TEXT,
    gmail_token_expiry TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    start_date TEXT,
    end_date TEXT,
    budget REAL DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS influencers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    platform TEXT NOT NULL,
    username TEXT,
    email TEXT,
    followers INTEGER DEFAULT 0,
    category TEXT,
    country TEXT,
    avatar_url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS email_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS outreach (
    id TEXT PRIMARY KEY,
    influencer_id TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    team_member_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    email_template_id TEXT,
    sent_at TEXT,
    opened_at TEXT,
    replied_at TEXT,
    follow_up_date TEXT,
    follow_up_sent INTEGER DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (influencer_id) REFERENCES influencers(id),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
    FOREIGN KEY (team_member_id) REFERENCES team_members(id)
  );

  CREATE TABLE IF NOT EXISTS pipeline (
    id TEXT PRIMARY KEY,
    influencer_id TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    team_member_id TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'confirmed',
    publication_date TEXT,
    is_overdue INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (influencer_id) REFERENCES influencers(id),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
    FOREIGN KEY (team_member_id) REFERENCES team_members(id)
  );

  CREATE TABLE IF NOT EXISTS content_schedule (
    id TEXT PRIMARY KEY,
    influencer_id TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    scheduled_date TEXT NOT NULL,
    platform TEXT NOT NULL,
    content_type TEXT DEFAULT 'video',
    video_url TEXT,
    status TEXT DEFAULT 'scheduled',
    views_24h INTEGER,
    views_7d INTEGER,
    likes INTEGER,
    comments INTEGER,
    engagement_rate REAL,
    shares INTEGER,
    price REAL DEFAULT 0,
    published_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (influencer_id) REFERENCES influencers(id),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    influencer_id TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    status TEXT DEFAULT 'pending',
    payment_method TEXT,
    payment_date TEXT,
    confirmation_sent INTEGER DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (influencer_id) REFERENCES influencers(id),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
  );

  CREATE TABLE IF NOT EXISTS performance (
    id TEXT PRIMARY KEY,
    influencer_id TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    cpm REAL,
    views_24h INTEGER,
    views_7d INTEGER,
    engagement_rate REAL,
    total_score REAL,
    ranking INTEGER,
    registrations INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (influencer_id) REFERENCES influencers(id),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
  );

  CREATE TABLE IF NOT EXISTS long_term_partners (
    id TEXT PRIMARY KEY,
    influencer_id TEXT NOT NULL UNIQUE,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    monthly_rate REAL DEFAULT 0,
    total_spend REAL DEFAULT 0,
    content_count INTEGER DEFAULT 0,
    avg_score REAL DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (influencer_id) REFERENCES influencers(id)
  );
`);

// reconcile()/sync look rows up by these keys once per record — unindexed that's a full-table
// scan each time (O(N²) once the mirror grows past ~2k rows). long_term_partners.influencer_id
// is already UNIQUE (auto-indexed).
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_pipeline_influencer ON pipeline(influencer_id);
  CREATE INDEX IF NOT EXISTS idx_content_influencer ON content_schedule(influencer_id);
  CREATE INDEX IF NOT EXISTS idx_payments_influencer ON payments(influencer_id);
  CREATE INDEX IF NOT EXISTS idx_outreach_influencer ON outreach(influencer_id);
`);
// feishu_chat_id is added by a later migration (feishuSync/feishuImport); index it once present.
const _infCols = (db.prepare(`PRAGMA table_info(influencers)`).all() as any[]).map((c) => c.name);
if (_infCols.includes('feishu_chat_id')) {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_influencers_chat ON influencers(feishu_chat_id)`);
}

export default db;
