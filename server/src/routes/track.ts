import { Router } from 'express';
import db from '../db';

const router = Router();

// 1x1 transparent GIF — the smallest valid tracking pixel
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

/**
 * GET /api/track/open/:id
 * Called when an influencer's email client loads the tracking pixel embedded in the outreach email.
 * Marks the outreach record as 'opened' and records the timestamp.
 * Always returns the pixel image so the email client doesn't show a broken image.
 */
router.get('/open/:id', (req, res) => {
  const { id } = req.params;

  try {
    const record = db.prepare('SELECT id, status FROM outreach WHERE id = ?').get(id) as any;

    if (record && record.status === 'sent') {
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE outreach SET status = 'opened', opened_at = ? WHERE id = ? AND status = 'sent'
      `).run(now, id);
    }
  } catch (err) {
    // Never let tracking errors break the pixel response
    console.error('Open tracking error:', err);
  }

  // Always respond with the pixel regardless of DB outcome
  res.set({
    'Content-Type': 'image/gif',
    'Content-Length': PIXEL.length,
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0',
  });
  res.end(PIXEL);
});

export default router;
