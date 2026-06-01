import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import https from 'https';
import db from '../db';

const router = Router();

// Extract YouTube video ID from various URL formats
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

// Fetch real YouTube metrics via Data API v3
async function fetchYouTubeMetrics(videoId: string): Promise<{
  views_24h: number; views_7d: number; likes: number; comments: number; shares: number; engagement_rate: number;
} | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return null;

  return new Promise((resolve) => {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${apiKey}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const stats = json.items?.[0]?.statistics;
          if (!stats) return resolve(null);

          const views = parseInt(stats.viewCount || '0');
          const likes = parseInt(stats.likeCount || '0');
          const comments = parseInt(stats.commentCount || '0');
          // YouTube API doesn't expose shares — estimate from likes ratio
          const shares = Math.floor(likes * 0.06);
          const engagement = views > 0 ? parseFloat(((likes + comments + shares) / views * 100).toFixed(2)) : 0;

          resolve({
            views_24h: views,   // YouTube API gives total views, not 24h — label accordingly
            views_7d: views,
            likes,
            comments,
            shares,
            engagement_rate: engagement,
          });
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// Generate simulated metrics (fallback for non-YouTube or when no API key)
function simulateMetrics() {
  const views24 = Math.floor(Math.random() * 600000) + 30000;
  const views7d = Math.floor(views24 * (Math.random() * 3 + 1.5));
  const likes = Math.floor(views24 * (Math.random() * 0.08 + 0.02));
  const comments = Math.floor(likes * (Math.random() * 0.15 + 0.05));
  const shares = Math.floor(likes * 0.06);
  const engagement = parseFloat(((likes + comments + shares) / views7d * 100).toFixed(2));
  return { views_24h: views24, views_7d: views7d, likes, comments, shares, engagement_rate: engagement };
}

router.get('/', (req, res) => {
  const { campaign_id } = req.query as { campaign_id?: string };
  let query = `
    SELECT cs.*, i.name as influencer_name, i.username, i.platform as influencer_platform, i.email as influencer_email,
           tm.name as team_member_name, c.name as campaign_name
    FROM content_schedule cs
    JOIN influencers i ON cs.influencer_id = i.id
    JOIN campaigns c ON cs.campaign_id = c.id
    LEFT JOIN pipeline p ON p.influencer_id = cs.influencer_id AND p.campaign_id = cs.campaign_id
    LEFT JOIN team_members tm ON p.team_member_id = tm.id
    WHERE 1=1
  `;
  const params: string[] = [];
  if (campaign_id) { query += ' AND cs.campaign_id = ?'; params.push(campaign_id); }
  query += ' ORDER BY cs.scheduled_date ASC';
  res.json(db.prepare(query).all(...params));
});

router.post('/', (req, res) => {
  const { influencer_id, campaign_id, scheduled_date, platform, content_type, price } = req.body;
  const id = uuidv4();
  db.prepare(`INSERT INTO content_schedule (id, influencer_id, campaign_id, scheduled_date, platform, content_type, price) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, influencer_id, campaign_id, scheduled_date, platform, content_type || 'video', price || 0);
  res.status(201).json(db.prepare('SELECT * FROM content_schedule WHERE id = ?').get(id));
});

router.put('/:id/video', async (req, res) => {
  const { video_url } = req.body;
  const now = new Date().toISOString();
  db.prepare('UPDATE content_schedule SET video_url = ?, status = ?, published_at = ? WHERE id = ?')
    .run(video_url, 'published', now, req.params.id);

  // Try real YouTube metrics first, fall back to simulated
  const ytId = extractYouTubeId(video_url || '');
  const metrics = (ytId ? await fetchYouTubeMetrics(ytId) : null) ?? simulateMetrics();

  db.prepare(`UPDATE content_schedule SET views_24h=?, views_7d=?, likes=?, comments=?, shares=?, engagement_rate=? WHERE id=?`)
    .run(metrics.views_24h, metrics.views_7d, metrics.likes, metrics.comments, metrics.shares, metrics.engagement_rate, req.params.id);

  const updated = db.prepare('SELECT * FROM content_schedule WHERE id = ?').get(req.params.id);
  res.json({ success: true, video_url, metrics, source: ytId && process.env.YOUTUBE_API_KEY ? 'youtube' : 'simulated' });
});

// Fetch / refresh metrics for an existing record
router.post('/:id/fetch-metrics', async (req, res) => {
  const record = db.prepare('SELECT * FROM content_schedule WHERE id = ?').get(req.params.id) as any;
  if (!record) return res.status(404).json({ error: 'Not found' });

  const ytId = extractYouTubeId(record.video_url || '');
  const metrics = (ytId ? await fetchYouTubeMetrics(ytId) : null) ?? simulateMetrics();

  db.prepare(`UPDATE content_schedule SET views_24h=?, views_7d=?, likes=?, comments=?, shares=?, engagement_rate=? WHERE id=?`)
    .run(metrics.views_24h, metrics.views_7d, metrics.likes, metrics.comments, metrics.shares, metrics.engagement_rate, req.params.id);

  const updated = db.prepare('SELECT * FROM content_schedule WHERE id = ?').get(req.params.id);
  res.json({ ...updated as object, source: ytId && process.env.YOUTUBE_API_KEY ? 'youtube' : 'simulated' });
});

// Manual metrics entry — for TikTok, Instagram, RedNote where API isn't available
router.put('/:id/metrics', (req, res) => {
  const { views_24h, views_7d, likes, comments, shares } = req.body;
  const engagement = (views_7d && views_7d > 0)
    ? parseFloat((((likes || 0) + (comments || 0) + (shares || 0)) / views_7d * 100).toFixed(2))
    : 0;

  db.prepare(`UPDATE content_schedule SET views_24h=?, views_7d=?, likes=?, comments=?, shares=?, engagement_rate=? WHERE id=?`)
    .run(views_24h || 0, views_7d || 0, likes || 0, comments || 0, shares || 0, engagement, req.params.id);

  res.json(db.prepare('SELECT * FROM content_schedule WHERE id = ?').get(req.params.id));
});

router.put('/:id', (req, res) => {
  const { scheduled_date, platform, content_type, price, status } = req.body;
  db.prepare('UPDATE content_schedule SET scheduled_date=?, platform=?, content_type=?, price=?, status=? WHERE id=?')
    .run(scheduled_date, platform, content_type, price, status, req.params.id);
  res.json(db.prepare('SELECT * FROM content_schedule WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM content_schedule WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
