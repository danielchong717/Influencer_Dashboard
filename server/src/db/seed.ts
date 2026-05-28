import db from './index';
import { v4 as uuidv4 } from 'uuid';

const seed = () => {
  const existingCampaign = db.prepare('SELECT id FROM campaigns LIMIT 1').get();
  if (existingCampaign) {
    console.log('Database already seeded.');
    return;
  }

  // Campaign
  const campaignId = uuidv4();
  db.prepare(`INSERT INTO campaigns (id, name, start_date, end_date, budget, status) VALUES (?, ?, ?, ?, ?, ?)`).run(
    campaignId, 'Spring 2026 Campaign', '2026-05-01', '2026-06-30', 50000, 'active'
  );

  // Team members (real)
  const members = [
    { id: uuidv4(), name: 'Daniel Chong', email: 'danielchonggoonhin@gmail.com' },
    { id: uuidv4(), name: 'John Doe', email: 'saintan717@gmail.com' },
  ];
  const insertMember = db.prepare(`INSERT OR IGNORE INTO team_members (id, name, email) VALUES (?, ?, ?)`);
  members.forEach(m => insertMember.run(m.id, m.name, m.email));

  // Email template
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

  console.log('Database seeded successfully!');
};

seed();
export default seed;
