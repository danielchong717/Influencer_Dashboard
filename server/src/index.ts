import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

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
import instagramRoutes from './routes/instagram';

import db from './db';
import seed from './db/seed';

dotenv.config();

seed();

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigin = process.env.NODE_ENV === 'production'
  ? (process.env.CLIENT_URL || true)
  : (process.env.CLIENT_URL || 'http://localhost:5173');
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use('/api/instagram', instagramRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
  });
}

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`\n🚀 Influencer Dashboard API running at http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
});

export default app;
