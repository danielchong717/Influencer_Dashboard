import { Router } from 'express';
import db from '../db';

const router = Router();

const GRAPH = 'https://graph.facebook.com/v21.0';
const APP_ID = process.env.INSTAGRAM_APP_ID || '';
const APP_SECRET = process.env.INSTAGRAM_APP_SECRET || '';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI || 'http://localhost:3001/api/instagram/callback';

function getAuth() {
  return (db.prepare('SELECT * FROM instagram_auth LIMIT 1').get() as any) || null;
}

async function igFetch(path: string, params: Record<string, string> = {}) {
  const auth = getAuth();
  if (!auth) throw new Error('Instagram not connected');
  const url = new URL(`${GRAPH}${path}`);
  url.searchParams.set('access_token', auth.access_token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const data = await res.json() as any;
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data;
}

// GET /api/instagram/status
router.get('/status', (req, res) => {
  const auth = getAuth();
  res.json({
    configured: !!(APP_ID && APP_SECRET),
    connected: !!(auth?.access_token),
    username: auth?.ig_username || null,
  });
});

// GET /api/instagram/auth-url
router.get('/auth-url', (req, res) => {
  if (!APP_ID) return res.status(500).json({ error: 'INSTAGRAM_APP_ID not set in .env' });
  const scopes = [
    'instagram_basic',
    'instagram_manage_hashtags',
    'pages_show_list',
    'pages_read_engagement',
  ].join(',');
  const url = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(scopes)}&response_type=code`;
  res.json({ url });
});

// GET /api/instagram/callback  (Facebook OAuth redirect target)
router.get('/callback', async (req, res) => {
  const { code, error: fbError } = req.query as Record<string, string>;
  if (fbError || !code) {
    return res.redirect(`${CLIENT_URL}/outreach?ig_error=${encodeURIComponent(fbError || 'cancelled')}`);
  }

  try {
    // Short-lived token
    const t1 = await fetch(`${GRAPH}/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code=${code}`);
    const d1 = await t1.json() as any;
    if (d1.error) throw new Error(d1.error.message);

    // Long-lived token (~60 days)
    const t2 = await fetch(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${d1.access_token}`);
    const d2 = await t2.json() as any;
    if (d2.error) throw new Error(d2.error.message);
    const token = d2.access_token;

    // Find a Facebook Page with a linked Instagram Business Account
    const pagesRes = await fetch(`${GRAPH}/me/accounts?access_token=${token}&fields=id,name,access_token,instagram_business_account`);
    const pagesData = await pagesRes.json() as any;
    const page = (pagesData.data || []).find((p: any) => p.instagram_business_account);
    if (!page) {
      throw new Error('No Instagram Business Account found. Make sure your Instagram is set to Business/Creator and linked to a Facebook Page.');
    }

    const igId = page.instagram_business_account.id;

    // Get IG profile info
    const igRes = await fetch(`${GRAPH}/${igId}?fields=id,username,name,followers_count&access_token=${token}`);
    const igData = await igRes.json() as any;
    if (igData.error) throw new Error(igData.error.message);

    db.prepare(`INSERT OR REPLACE INTO instagram_auth (id, access_token, ig_user_id, ig_username, page_id, updated_at)
      VALUES (1, ?, ?, ?, ?, datetime('now'))`)
      .run(token, igId, igData.username, page.id);

    res.redirect(`${CLIENT_URL}/outreach?ig_connected=1`);
  } catch (e: any) {
    console.error('[Instagram OAuth]', e.message);
    res.redirect(`${CLIENT_URL}/outreach?ig_error=${encodeURIComponent(e.message)}`);
  }
});

// DELETE /api/instagram/disconnect
router.delete('/disconnect', (req, res) => {
  db.prepare('DELETE FROM instagram_auth WHERE id = 1').run();
  res.json({ success: true });
});

// POST /api/instagram/hashtag-search
// body: { hashtags, min_followers?, max_followers?, min_avg_views? }
// Returns creator profiles (not posts) that match the criteria.
router.post('/hashtag-search', async (req, res) => {
  const {
    hashtags,
    min_followers = 0,
    max_followers = 999999999,
    min_avg_views = 0,
  } = req.body as {
    hashtags: string[];
    min_followers?: number;
    max_followers?: number;
    min_avg_views?: number;
  };

  if (!hashtags?.length) return res.status(400).json({ error: 'hashtags required' });

  const auth = getAuth();
  if (!auth) return res.status(401).json({ error: 'Instagram not connected' });
  const igUserId = auth.ig_user_id;

  // Step 1 — collect unique owner IDs from hashtag posts
  const ownerIds = new Set<string>();

  for (const raw of hashtags.slice(0, 5)) {
    const tag = raw.replace(/^#/, '').toLowerCase().trim();
    if (!tag) continue;
    try {
      const h = await igFetch(`/${igUserId}/hashtag_search`, { q: tag });
      const hashId = h.data?.[0]?.id;
      if (!hashId) continue;

      const m = await igFetch(`/${hashId}/recent_media`, {
        fields: 'id,owner',
        limit: '50',
      });

      for (const item of (m.data || [])) {
        if (item.owner?.id) ownerIds.add(item.owner.id);
      }
    } catch (e: any) {
      console.warn(`[IG hashtag #${tag}]`, e.message);
    }
  }

  // Step 2 — fetch profile + media for each unique owner, apply filters
  const profiles: any[] = [];

  for (const ownerId of [...ownerIds].slice(0, 30)) {
    try {
      const profile = await igFetch(`/${ownerId}`, {
        fields: 'id,username,name,biography,followers_count,media_count,profile_picture_url,website',
      });

      if (!profile.username) continue;

      const followers = profile.followers_count || 0;
      if (followers < Number(min_followers) || followers > Number(max_followers)) continue;

      // Fetch recent media to compute avg reel views
      let avgReelViews = 0;
      let reelsSampled = 0;
      try {
        const media = await igFetch(`/${ownerId}/media`, {
          fields: 'media_type,video_views',
          limit: '12',
        });
        const reels = (media.data || []).filter(
          (m: any) => m.media_type === 'VIDEO' && (m.video_views || 0) > 0
        );
        reelsSampled = reels.length;
        avgReelViews = reels.length
          ? Math.round(reels.reduce((s: number, m: any) => s + m.video_views, 0) / reels.length)
          : 0;
      } catch {}

      if (Number(min_avg_views) > 0 && avgReelViews < Number(min_avg_views)) continue;

      profiles.push({ ...profile, avg_reel_views: avgReelViews, reels_sampled: reelsSampled });
    } catch (e: any) {
      console.warn(`[IG profile ${ownerId}]`, e.message);
    }
  }

  profiles.sort((a, b) => b.avg_reel_views - a.avg_reel_views);
  res.json(profiles);
});

// GET /api/instagram/profile?username=xxx  — Business Discovery lookup
router.get('/profile', async (req, res) => {
  const { username } = req.query as { username: string };
  if (!username) return res.status(400).json({ error: 'username required' });

  const auth = getAuth();
  if (!auth) return res.status(401).json({ error: 'Instagram not connected' });

  try {
    const fields = [
      'business_discovery.fields(',
      'username,name,biography,website,',
      'followers_count,media_count,profile_picture_url,',
      'media.limit(12){media_type,video_views,like_count,timestamp,permalink}',
      ')',
    ].join('');

    const data = await igFetch(`/${auth.ig_user_id}`, { fields, username });
    const bd = data.business_discovery;
    if (!bd) return res.status(404).json({ error: 'Account not found or not a Business/Creator account' });

    const reels = (bd.media?.data || []).filter((m: any) => m.media_type === 'VIDEO' && (m.video_views || 0) > 0);
    const avgReelViews = reels.length
      ? Math.round(reels.reduce((s: number, m: any) => s + m.video_views, 0) / reels.length)
      : 0;

    res.json({
      username: bd.username,
      name: bd.name || bd.username,
      biography: bd.biography || '',
      website: bd.website || '',
      followers_count: bd.followers_count || 0,
      media_count: bd.media_count || 0,
      profile_picture_url: bd.profile_picture_url || '',
      avg_reel_views: avgReelViews,
      reels_sampled: reels.length,
      recent_media: (bd.media?.data || []).slice(0, 6),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
