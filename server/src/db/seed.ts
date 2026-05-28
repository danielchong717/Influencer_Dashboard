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
    'Collaboration Opportunity with Ji Bei Chuan',
    `Hi {{name}},

I hope this message finds you well! My name is {{sender_name}} from Ji Bei Chuan, an authentic rice noodle restaurant known for our rich broths, hand-crafted noodles, and a wide variety of traditional dishes made with fresh, bold flavors.

We've been following your content on {{platform}} and think you'd be an amazing fit for a collaboration with us. We're looking to work with passionate creators to shoot promotional videos and photos that capture the real Ji Bei Chuan experience: the food, the atmosphere, the story.

Here's what we have in mind:
- A complimentary dining experience at Ji Bei Chuan
- Creative freedom to shoot content in your own style
- Promotional videos and/or photos showcasing our restaurant and dishes
- Fair compensation for your time and content

Whether it's a food reel, a restaurant vlog, or stunning food photography, we're open to whatever fits your style best. We'd love to have you come in, enjoy the food, and let your audience discover Ji Bei Chuan through your lens.

Would you be open to visiting us and creating something together? Looking forward to hearing from you!

Best regards,
{{sender_name}}
Ji Bei Chuan Marketing Team`
  );

  console.log('Database seeded successfully!');
};

seed();
export default seed;
