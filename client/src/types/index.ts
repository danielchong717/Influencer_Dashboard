export interface TeamMember {
  id: string;
  name: string;
  email: string;
  gmail_refresh_token?: string;
}

export interface Campaign {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  budget: number;
  status: 'active' | 'completed' | 'paused';
  created_at: string;
}

export interface Influencer {
  id: string;
  name: string;
  platform: 'TikTok' | 'YouTube' | 'Instagram' | 'RedNote' | string;
  username: string;
  email: string;
  followers: number;
  category: string;
  country: string;
  avg_reel_views?: number;
  avatar_url?: string;
  created_at: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  created_at: string;
}

export interface OutreachRecord {
  id: string;
  influencer_id: string;
  campaign_id: string;
  team_member_id: string;
  status: 'added' | 'pending' | 'sent' | 'opened' | 'replied' | 'confirmed';
  email_template_id?: string;
  sent_at?: string;
  opened_at?: string;
  replied_at?: string;
  follow_up_date?: string;
  follow_up_sent: number;
  notes?: string;
  created_at: string;
  // Joined fields
  influencer_name: string;
  platform: string;
  influencer_email: string;
  username: string;
  followers: number;
  team_member_name: string;
  campaign_name: string;
  template_subject?: string;
}

export type PipelineStage =
  | 'confirmed'
  | 'waiting_brief'
  | 'brief_sent'
  | 'giving_feedback'
  | 'creating_video'
  | 'video_overdue'
  | 'scheduled'
  | 'published';

export const STAGE_LABELS: Record<PipelineStage, string> = {
  confirmed: 'Confirmed',
  waiting_brief: 'Waiting for Brief',
  brief_sent: 'Brief Sent',
  giving_feedback: 'Giving Feedback',
  creating_video: 'Creating Video',
  video_overdue: 'Video Overdue',
  scheduled: 'Scheduled',
  published: 'Published',
};

export const STAGE_COLORS: Record<PipelineStage, string> = {
  confirmed: 'bg-green-100 text-green-700',
  waiting_brief: 'bg-yellow-100 text-yellow-700',
  brief_sent: 'bg-blue-100 text-blue-700',
  giving_feedback: 'bg-purple-100 text-purple-700',
  creating_video: 'bg-indigo-100 text-indigo-700',
  video_overdue: 'bg-red-100 text-red-700',
  scheduled: 'bg-teal-100 text-teal-700',
  published: 'bg-slate-100 text-slate-700',
};

export interface PipelineCard {
  id: string;
  influencer_id: string;
  campaign_id: string;
  team_member_id: string;
  stage: PipelineStage;
  publication_date?: string;
  is_overdue: number;
  position: number;
  created_at: string;
  updated_at: string;
  // Joined
  influencer_name: string;
  platform: string;
  username: string;
  followers: number;
  category: string;
  team_member_name: string;
  campaign_name: string;
}

export interface ContentItem {
  id: string;
  influencer_id: string;
  campaign_id: string;
  scheduled_date: string;
  platform: string;
  content_type: string;
  video_url?: string;
  status: 'scheduled' | 'published';
  views_24h?: number;
  views_7d?: number;
  likes?: number;
  comments?: number;
  engagement_rate?: number;
  shares?: number;
  price: number;
  published_at?: string;
  created_at: string;
  // Joined
  influencer_name: string;
  username: string;
  influencer_email: string;
  team_member_name?: string;
  campaign_name: string;
}

export interface Payment {
  id: string;
  influencer_id: string;
  campaign_id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid';
  payment_method?: string;
  payment_date?: string;
  confirmation_sent: number;
  notes?: string;
  created_at: string;
  // Joined
  influencer_name: string;
  platform: string;
  influencer_email: string;
  username: string;
  campaign_name: string;
}

export interface PaymentOverview {
  total_count: number;
  total_amount: number;
  paid_amount: number;
  pending_amount: number;
  paid_count: number;
  pending_count: number;
}

export interface PerformanceRecord {
  id: string;
  influencer_id: string;
  campaign_id: string;
  cpm: number;
  views_24h: number;
  views_7d: number;
  engagement_rate: number;
  total_score: number;
  ranking: number;
  registrations: number;
  // Joined
  name: string;
  platform: string;
  username: string;
  followers: number;
  category: string;
  payment_amount?: number;
  rank: number;
}

export interface ReportOverview {
  total_influencers: number;
  total_views_24h: number;
  total_views_7d: number;
  total_likes: number;
  avg_engagement: number;
  total_registrations: number;
  total_spend: number;
  cpm: number;
  open_rate: number;
  reply_rate: number;
}

export interface LongTermPartner {
  id: string;
  influencer_id: string;
  start_date: string;
  end_date: string;
  monthly_rate: number;
  total_spend: number;
  content_count: number;
  avg_score: number;
  status: 'active' | 'completed' | 'paused';
  created_at: string;
  // Joined
  influencer_name: string;
  platform: string;
  username: string;
  followers: number;
  category: string;
  influencer_email: string;
  latest_score?: number;
  engagement_rate?: number;
  views_7d?: number;
}

export type TabId = 'overview' | 'outreach' | 'pipeline' | 'content' | 'payment' | 'report' | 'longterm';
