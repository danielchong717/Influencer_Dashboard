import { Router } from 'express';

const router = Router();

const APIFY_TOKEN = process.env.APIFY_API_KEY || '';
const APIFY_BASE = 'https://api.apify.com/v2';

async function runActor(actorId: string, input: any, timeoutSecs = 120): Promise<any[]> {
  const url = `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items`
    + `?token=${APIFY_TOKEN}&timeout=${timeoutSecs}&memoryMbytes=256`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Apify ${actorId} failed: ${await res.text()}`);
  return res.json() as Promise<any[]>;
}

// GET /api/instagram/status
router.get('/status', (_req, res) => {
  res.json({
    configured: !!APIFY_TOKEN,
    connected: !!APIFY_TOKEN,
    username: null,
    provider: 'apify',
  });
});

// POST /api/instagram/hashtag-search
// body: { hashtags, min_followers?, max_followers?, min_avg_views? }
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
  if (!APIFY_TOKEN) return res.status(500).json({ error: 'APIFY_API_KEY not set in .env' });

  try {
    // Step 1 — scrape posts for each hashtag, collect unique owner usernames
    const cleanTags = hashtags.slice(0, 5).map((h: string) => h.replace(/^#/, '').trim());

    const posts = await runActor('apify~instagram-hashtag-scraper', {
      hashtags: cleanTags,
      resultsLimit: 50,
    }, 120);

    const usernames = [...new Set(
      posts.map((p: any) => p.ownerUsername).filter(Boolean)
    )].slice(0, 25) as string[];

    if (!usernames.length) return res.json([]);

    // Step 2 — fetch full profiles for those usernames
    const profiles = await runActor('apify~instagram-profile-scraper', {
      usernames,
    }, 120);

    // Step 3 — compute avg reel views and apply filters
    const results = profiles
      .map((p: any) => {
        const reels = (p.latestPosts || []).filter(
          (post: any) => post.type === 'Video' && (post.videoViewCount || 0) > 0
        );
        const avgReelViews = reels.length
          ? Math.round(reels.reduce((s: number, post: any) => s + post.videoViewCount, 0) / reels.length)
          : 0;
        return {
          id: p.username,
          username: p.username,
          name: p.fullName || p.username,
          biography: p.biography || '',
          followers_count: p.followersCount || 0,
          media_count: p.postsCount || 0,
          profile_picture_url: p.profilePicUrl || '',
          avg_reel_views: avgReelViews,
          reels_sampled: reels.length,
        };
      })
      .filter((p: any) =>
        p.followers_count >= Number(min_followers) &&
        p.followers_count <= Number(max_followers) &&
        (Number(min_avg_views) === 0 || p.avg_reel_views >= Number(min_avg_views))
      )
      .sort((a: any, b: any) => b.avg_reel_views - a.avg_reel_views);

    res.json(results);
  } catch (e: any) {
    console.error('[Apify search]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/instagram/profile?username=xxx
router.get('/profile', async (req, res) => {
  const { username } = req.query as { username: string };
  if (!username) return res.status(400).json({ error: 'username required' });
  if (!APIFY_TOKEN) return res.status(500).json({ error: 'APIFY_API_KEY not set in .env' });

  try {
    const profiles = await runActor('apify~instagram-profile-scraper', {
      usernames: [username.replace('@', '').trim()],
    }, 60);

    if (!profiles.length) return res.status(404).json({ error: 'Profile not found' });

    const p = profiles[0];
    const reels = (p.latestPosts || []).filter(
      (post: any) => post.type === 'Video' && (post.videoViewCount || 0) > 0
    );
    const avgReelViews = reels.length
      ? Math.round(reels.reduce((s: number, post: any) => s + post.videoViewCount, 0) / reels.length)
      : 0;

    res.json({
      id: p.username,
      username: p.username,
      name: p.fullName || p.username,
      biography: p.biography || '',
      followers_count: p.followersCount || 0,
      media_count: p.postsCount || 0,
      profile_picture_url: p.profilePicUrl || '',
      avg_reel_views: avgReelViews,
      reels_sampled: reels.length,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
