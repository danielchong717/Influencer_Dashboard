import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import authRoutes from './routes/auth';
import influencerRoutes from './routes/influencers';
import outreachRoutes from './routes/outreach';
import pipelineRoutes from './routes/pipeline';
import contentRoutes from './routes/content';
import paymentRoutes from './routes/payment';
import reportRoutes from './routes/report';
import longtermRoutes from './routes/longterm';
import trackRoutes from './routes/track';
import campaignRoutes from './routes/campaigns';
import funnelRoutes from './routes/funnel';

import db from './db';
import seed from './db/seed';

dotenv.config();

seed();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- access gate (shared token) --------------------------------------------
// The dashboard is exposed publicly via a Cloudflare tunnel with no login, but it
// now WRITES back to Feishu (the source of truth: mark-paid, edit credit/status).
// A shared token gates all /api/* + the SPA. Unauthed browsers get a token page;
// unauthed /api calls get 401. First visit via magic link (/api/gate?token=…) sets
// a 1-year cookie, so each device authenticates once. Token lives in .env.secrets
// (never in this public repo). If unset → gate is disabled (fail-open for uptime).
const DASH_TOKEN = process.env.DASH_ACCESS_TOKEN || '';
if (!DASH_TOKEN) {
  console.warn('⚠️  DASH_ACCESS_TOKEN not set — access gate DISABLED (anyone with the URL can read/write).');
}
const gateAllow = (p: string) =>
  p === '/api/health' || p.startsWith('/api/track') || p.startsWith('/api/auth/gmail/callback');
function tokenOK(supplied: string): boolean {
  if (!DASH_TOKEN || !supplied || supplied.length !== DASH_TOKEN.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(DASH_TOKEN)); } catch { return false; }
}
function readCookie(req: any, name: string): string {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return '';
}
const GATE_HTML = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"><title>KOL Dashboard</title><style>body{font-family:-apple-system,system-ui,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}.c{background:#1e293b;padding:2rem;border-radius:12px;width:min(90vw,320px);box-shadow:0 10px 40px rgba(0,0,0,.4)}h1{font-size:1.1rem;margin:0 0 1rem}input{width:100%;box-sizing:border-box;padding:.6rem;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:1rem}button{width:100%;margin-top:.75rem;padding:.6rem;border:0;border-radius:8px;background:#6366f1;color:#fff;font-size:1rem;cursor:pointer}.e{color:#f87171;font-size:.85rem;margin-top:.5rem;min-height:1rem}</style></head><body><div class=c><h1>🔒 KOL Dashboard</h1><input id=t type=password placeholder="Access token" autofocus><button onclick=go()>Enter</button><div class=e id=e></div></div><script>async function go(){var t=document.getElementById('t').value.trim();if(!t)return;var r=await fetch('/api/gate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:t})});if(r.ok){location.href='/'}else{document.getElementById('e').textContent='Wrong token'}}document.getElementById('t').addEventListener('keydown',function(e){if(e.key==='Enter')go()})</script></body></html>`;
app.use((req, res, next) => {
  if (!DASH_TOKEN) return next();
  if (req.path === '/api/gate') {                       // set-cookie endpoint (magic link or form POST)
    const supplied = String((req.query.token ?? (req.body && req.body.token)) || '');
    if (!tokenOK(supplied)) return res.status(401).json({ ok: false });
    res.cookie('dash_auth', DASH_TOKEN, { httpOnly: true, sameSite: 'lax', maxAge: 365 * 24 * 3600 * 1000 });
    return req.method === 'GET' ? res.redirect('/') : res.json({ ok: true });
  }
  if (gateAllow(req.path)) return next();               // health probe / tracking pixel / OAuth callback
  if (tokenOK(readCookie(req, 'dash_auth')) || tokenOK(String(req.headers['x-dash-token'] || ''))) return next();
  if (req.path.startsWith('/api')) return res.status(401).json({ error: 'auth required' });
  return res.status(200).type('html').send(GATE_HTML);  // unauthed browser → token page
});
// ---------------------------------------------------------------------------

app.use('/api/auth', authRoutes);
app.use('/api/influencers', influencerRoutes);
app.use('/api/outreach', outreachRoutes);
app.use('/api/pipeline', pipelineRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/longterm', longtermRoutes);
app.use('/api/track', trackRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/funnel', funnelRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`\n🚀 Influencer Dashboard API running at http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
});

export default app;
