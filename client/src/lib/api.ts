import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Auth
export const getGmailAuthUrl = (teamMemberId?: string) =>
  api.get<{ url: string }>('/auth/gmail/url', { params: teamMemberId ? { team_member_id: teamMemberId } : {} });
export const getGmailStatus = () =>
  api.get<{ connected: boolean; member: any; connectedMembers: { id: string; name: string; email: string }[] }>('/auth/gmail/status');
export const disconnectGmail = (teamMemberId?: string) =>
  api.delete('/auth/gmail', { params: teamMemberId ? { team_member_id: teamMemberId } : {} });
export const getTeamMembers = () => api.get<any[]>('/auth/team-members');

// Campaigns
export const getCampaigns = () => api.get<any[]>('/campaigns');
export const createCampaign = (data: any) => api.post('/campaigns', data);
export const updateCampaign = (id: string, data: any) => api.put(`/campaigns/${id}`, data);
export const deleteCampaign = (id: string) => api.delete(`/campaigns/${id}`);

// Influencers
export const getInfluencers = (params?: Record<string, string>) => api.get<any[]>('/influencers', { params });
export const createInfluencer = (data: any) => api.post('/influencers', data);
export const updateInfluencer = (id: string, data: any) => api.put(`/influencers/${id}`, data);
export const deleteInfluencer = (id: string) => api.delete(`/influencers/${id}`);

// Outreach
export const getOutreach = (params?: Record<string, string>) => api.get<any[]>('/outreach', { params });
export const getOutreachAnalytics = (params?: Record<string, string>) => api.get<any>('/outreach/analytics', { params });
export const getFollowUps = () => api.get<any[]>('/outreach/follow-ups');
export const sendOutreachEmails = (data: any) => api.post('/outreach/send', data);
export const updateOutreachStatus = (id: string, status: string, influencer_id?: string, campaign_id?: string) => api.put(`/outreach/${id}/status`, { status, influencer_id, campaign_id });
export const sendFollowUp = (id: string) => api.post(`/outreach/${id}/follow-up`);
export const getEmailTemplates = () => api.get<any[]>('/outreach/templates');
export const createEmailTemplate = (data: any) => api.post('/outreach/templates', data);
export const updateEmailTemplate = (id: string, data: any) => api.put(`/outreach/templates/${id}`, data);
export const deleteEmailTemplate = (id: string) => api.delete(`/outreach/templates/${id}`);
export const discoverInfluencers = (params?: Record<string, string>) => api.get<any[]>('/outreach/discover', { params });

// Pipeline
export const getPipeline = (params?: Record<string, string>) => api.get<any>('/pipeline', { params });
export const getPipelineStats = (params?: Record<string, string>) => api.get<any[]>('/pipeline/stats', { params });
export const updatePipelineStage = (id: string, stage: string) => api.put(`/pipeline/${id}/stage`, { stage });
export const updatePublicationDate = (id: string, date: string) => api.put(`/pipeline/${id}/date`, { publication_date: date });
export const createPipelineCard = (data: any) => api.post('/pipeline', data);
export const deletePipelineCard = (id: string) => api.delete(`/pipeline/${id}`);

// Content
export const getContent = (params?: Record<string, string>) => api.get<any[]>('/content', { params });
export const createContent = (data: any) => api.post('/content', data);
export const updateVideoLink = (id: string, url: string) => api.put(`/content/${id}/video`, { video_url: url });
export const fetchMetrics = (id: string) => api.post(`/content/${id}/fetch-metrics`);
export const updateMetricsManual = (id: string, data: any) => api.put(`/content/${id}/metrics`, data);

// Payment
export const getPayments = (params?: Record<string, string>) => api.get<any[]>('/payment', { params });
export const getPaymentOverview = (params?: Record<string, string>) => api.get<any>('/payment/overview', { params });
export const updatePaymentStatus = (id: string, status: string) => api.put(`/payment/${id}/status`, { status });
export const createPayment = (data: any) => api.post('/payment', data);

// Report
export const getReportOverview = (params?: Record<string, string>) => api.get<any>('/report/overview', { params });
export const getReportRanking = (params?: Record<string, string>) => api.get<any[]>('/report/ranking', { params });
export const getReportTimeline = (params?: Record<string, string>) => api.get<any[]>('/report/timeline', { params });
export const getReportTakeaways = (params?: Record<string, string>) => api.get<any>('/report/takeaways', { params });
export const getProfileBreakdown = (params?: Record<string, string>) => api.get<any[]>('/report/profile-breakdown', { params });

// Funnel (Overview)
export const getFunnel = (params?: Record<string, string>) => api.get<any>('/funnel', { params });
export const markFunnelAction = (chat_id: string, action: string, done: boolean) =>
  api.post('/funnel/action', { chat_id, action, done });

// Long-term
export const getLongTermPartners = () => api.get<any[]>('/longterm');
export const signLongTermPartner = (data: any) => api.post('/longterm', data);
export const updateLongTermPartner = (id: string, data: any) => api.put(`/longterm/${id}`, data);
export const deleteLongTermPartner = (id: string) => api.delete(`/longterm/${id}`);

// Instagram
export const getInstagramStatus = () => api.get<any>('/instagram/status');
export const getInstagramAuthUrl = () => api.get<{ url: string }>('/instagram/auth-url');
export const disconnectInstagram = () => api.delete('/instagram/disconnect');
export const searchInstagramHashtags = (
  hashtags: string[],
  filters?: { min_followers?: number; max_followers?: number; min_avg_views?: number }
) => api.post<any[]>('/instagram/hashtag-search', { hashtags, ...filters });
export const lookupInstagramProfile = (username: string) => api.get<any>('/instagram/profile', { params: { username } });

export default api;
