import db from './index';
import { v4 as uuidv4 } from 'uuid';

const seed = () => {
  const existingCampaign = db.prepare('SELECT id FROM campaigns LIMIT 1').get();
  if (existingCampaign) {
    console.log('Database already seeded.');
    return;
  }

  const campaignId = uuidv4();
  db.prepare(`INSERT INTO campaigns (id, name, start_date, end_date, budget, status) VALUES (?, ?, ?, ?, ?, ?)`).run(
    campaignId, 'Spring 2026 Campaign', '2026-05-01', '2026-06-30', 50000, 'active'
  );

  const members = [
    { id: uuidv4(), name: 'Sarah Chen', email: 'sarah@company.com' },
    { id: uuidv4(), name: 'Mike Rodriguez', email: 'mike@company.com' },
    { id: uuidv4(), name: 'Emma Liu', email: 'emma@company.com' },
  ];
  const insertMember = db.prepare(`INSERT OR IGNORE INTO team_members (id, name, email) VALUES (?, ?, ?)`);
  members.forEach(m => insertMember.run(m.id, m.name, m.email));

  const influencers = [
    { id: uuidv4(), name: 'Alex Zhang', platform: 'TikTok', username: '@alexz_official', email: 'alex.zhang@gmail.com', followers: 2100000, category: 'Lifestyle', country: 'US' },
    { id: uuidv4(), name: 'Bella Kim', platform: 'YouTube', username: '@bellakim', email: 'bella.kim@outlook.com', followers: 890000, category: 'Beauty', country: 'KR' },
    { id: uuidv4(), name: 'Chris Wang', platform: 'Instagram', username: '@chriswang', email: 'chris.wang@gmail.com', followers: 450000, category: 'Fitness', country: 'CN' },
    { id: uuidv4(), name: 'Diana Park', platform: 'TikTok', username: '@dianapark', email: 'diana.park@naver.com', followers: 3200000, category: 'Food', country: 'KR' },
    { id: uuidv4(), name: 'Ethan Li', platform: 'YouTube', username: '@ethanli_tech', email: 'ethan.li@gmail.com', followers: 1200000, category: 'Tech', country: 'CN' },
    { id: uuidv4(), name: 'Fiona Sun', platform: 'RedNote', username: '@fionasun', email: 'fiona.sun@qq.com', followers: 780000, category: 'Fashion', country: 'CN' },
    { id: uuidv4(), name: 'George Tan', platform: 'TikTok', username: '@georgetan', email: 'george.tan@gmail.com', followers: 560000, category: 'Gaming', country: 'MY' },
    { id: uuidv4(), name: 'Hannah Zhou', platform: 'Instagram', username: '@hannahzhou', email: 'hannah.zhou@gmail.com', followers: 320000, category: 'Travel', country: 'US' },
    { id: uuidv4(), name: 'Ivan Chen', platform: 'YouTube', username: '@ivanchenofficial', email: 'ivan.chen@gmail.com', followers: 2800000, category: 'Comedy', country: 'TW' },
    { id: uuidv4(), name: 'Jenny Wu', platform: 'TikTok', username: '@jennywu', email: 'jenny.wu@hotmail.com', followers: 4500000, category: 'Dance', country: 'US' },
    { id: uuidv4(), name: 'Kevin Ma', platform: 'RedNote', username: '@kevinma', email: 'kevin.ma@qq.com', followers: 650000, category: 'Food', country: 'CN' },
    { id: uuidv4(), name: 'Lucy Huang', platform: 'Instagram', username: '@lucyhuang', email: 'lucy.huang@gmail.com', followers: 980000, category: 'Beauty', country: 'HK' },
    { id: uuidv4(), name: 'Marcus Lee', platform: 'YouTube', username: '@marcuslee', email: 'marcus.lee@gmail.com', followers: 1700000, category: 'Fitness', country: 'SG' },
    { id: uuidv4(), name: 'Nina Zhao', platform: 'TikTok', username: '@ninazhao', email: 'nina.zhao@163.com', followers: 2300000, category: 'Lifestyle', country: 'CN' },
    { id: uuidv4(), name: 'Oscar Lim', platform: 'Instagram', username: '@oscarlim', email: 'oscar.lim@gmail.com', followers: 410000, category: 'Fashion', country: 'PH' },
  ];

  const insertInfluencer = db.prepare(`INSERT INTO influencers (id, name, platform, username, email, followers, category, country) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  influencers.forEach(i => insertInfluencer.run(i.id, i.name, i.platform, i.username, i.email, i.followers, i.category, i.country));

  const templateId = uuidv4();
  db.prepare(`INSERT INTO email_templates (id, name, subject, body) VALUES (?, ?, ?, ?)`).run(
    templateId,
    'Initial Outreach',
    'Collaboration Opportunity with [Brand Name]',
    `Hi {{name}},

I hope this message finds you well! I'm reaching out from [Brand Name] because we've been following your content on {{platform}} and absolutely love what you create.

We'd love to explore a potential collaboration with you for our upcoming campaign. We think your audience would genuinely connect with our product.

Here's what we're offering:
- Competitive compensation based on your rates
- Full creative freedom
- Long-term partnership potential

Would you be open to a quick chat to discuss the details? Looking forward to hearing from you!

Best regards,
{{sender_name}}
[Brand Name] Marketing Team`
  );

  const outreachStatuses = ['pending', 'sent', 'opened', 'replied', 'confirmed'];
  const insertOutreach = db.prepare(`INSERT INTO outreach (id, influencer_id, campaign_id, team_member_id, status, email_template_id, sent_at, opened_at, replied_at, follow_up_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  influencers.forEach((inf, idx) => {
    const memberIdx = idx % members.length;
    const status = outreachStatuses[Math.min(idx, outreachStatuses.length - 1)];
    const sentAt = status !== 'pending' ? `2026-05-${String(idx + 1).padStart(2, '0')} 09:00:00` : null;
    const openedAt = ['opened', 'replied', 'confirmed'].includes(status) ? `2026-05-${String(idx + 2).padStart(2, '0')} 14:30:00` : null;
    const repliedAt = ['replied', 'confirmed'].includes(status) ? `2026-05-${String(idx + 3).padStart(2, '0')} 10:00:00` : null;
    const followUpDate = status === 'sent' ? `2026-06-01` : null;

    insertOutreach.run(uuidv4(), inf.id, campaignId, members[memberIdx].id, status, templateId, sentAt, openedAt, repliedAt, followUpDate);
  });

  const confirmedInfluencers = influencers.slice(5, 15);
  const stages = ['confirmed', 'waiting_brief', 'brief_sent', 'giving_feedback', 'creating_video', 'video_overdue', 'scheduled', 'published'];
  const insertPipeline = db.prepare(`INSERT INTO pipeline (id, influencer_id, campaign_id, team_member_id, stage, publication_date, is_overdue, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

  confirmedInfluencers.forEach((inf, idx) => {
    const memberIdx = idx % members.length;
    const stage = stages[idx % stages.length];
    const isOverdue = stage === 'video_overdue' ? 1 : 0;
    const pubDate = ['scheduled', 'published'].includes(stage) ? `2026-05-${String(20 + idx).padStart(2, '0')}` : null;
    insertPipeline.run(uuidv4(), inf.id, campaignId, members[memberIdx].id, stage, pubDate, isOverdue, idx);
  });

  const publishedInfluencers = influencers.slice(7, 12);
  const insertContent = db.prepare(`INSERT INTO content_schedule (id, influencer_id, campaign_id, scheduled_date, platform, video_url, status, views_24h, views_7d, likes, comments, engagement_rate, shares, price, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  publishedInfluencers.forEach((inf, idx) => {
    const views24 = Math.floor(Math.random() * 500000) + 50000;
    const views7d = views24 * (Math.random() * 3 + 2);
    const likes = Math.floor(views24 * 0.05);
    const comments = Math.floor(likes * 0.1);
    const shares = Math.floor(likes * 0.05);
    const engagement = ((likes + comments + shares) / views7d * 100);
    const price = Math.floor(Math.random() * 3000) + 500;

    insertContent.run(
      uuidv4(), inf.id, campaignId,
      `2026-05-${String(15 + idx).padStart(2, '0')}`,
      inf.platform,
      `https://www.${inf.platform.toLowerCase()}.com/@${inf.username?.replace('@', '')}/video/${idx + 1}`,
      'published',
      views24, Math.floor(views7d), likes, comments, parseFloat(engagement.toFixed(2)), shares, price,
      `2026-05-${String(15 + idx).padStart(2, '0')} 18:00:00`
    );
  });

  const scheduledInfluencers = influencers.slice(12, 15);
  scheduledInfluencers.forEach((inf, idx) => {
    const price = Math.floor(Math.random() * 2000) + 800;
    insertContent.run(
      uuidv4(), inf.id, campaignId,
      `2026-06-${String(idx + 1).padStart(2, '0')}`,
      inf.platform, null, 'scheduled',
      null, null, null, null, null, null, price, null
    );
  });

  const insertPayment = db.prepare(`INSERT INTO payments (id, influencer_id, campaign_id, amount, currency, status, payment_date) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  publishedInfluencers.forEach((inf, idx) => {
    const amount = Math.floor(Math.random() * 3000) + 500;
    const status = idx < 3 ? 'paid' : 'pending';
    const paymentDate = status === 'paid' ? `2026-05-${String(17 + idx).padStart(2, '0')}` : null;
    insertPayment.run(uuidv4(), inf.id, campaignId, amount, 'USD', status, paymentDate);
  });

  const insertPerf = db.prepare(`INSERT INTO performance (id, influencer_id, campaign_id, cpm, views_24h, views_7d, engagement_rate, total_score, ranking, registrations) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  publishedInfluencers.forEach((inf, idx) => {
    const views24 = Math.floor(Math.random() * 500000) + 50000;
    const views7d = Math.floor(views24 * (Math.random() * 3 + 2));
    const engagement = parseFloat((Math.random() * 8 + 1).toFixed(2));
    const amount = Math.floor(Math.random() * 3000) + 500;
    const cpm = parseFloat((amount / views7d * 1000).toFixed(2));
    const score = parseFloat(((engagement * 0.4) + (views24 / 100000 * 0.3) + (views7d / 300000 * 0.3)).toFixed(2));
    const registrations = Math.floor(views7d * 0.001);
    insertPerf.run(uuidv4(), inf.id, campaignId, cpm, views24, views7d, engagement, score, idx + 1, registrations);
  });

  const longTermInfluencer = influencers[0];
  db.prepare(`INSERT OR IGNORE INTO long_term_partners (id, influencer_id, start_date, end_date, monthly_rate, total_spend, content_count, avg_score, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    uuidv4(), longTermInfluencer.id, '2026-04-01', '2026-09-30', 5000, 10000, 4, 8.5, 'active'
  );

  console.log('Database seeded successfully!');
};

seed();
export default seed;
