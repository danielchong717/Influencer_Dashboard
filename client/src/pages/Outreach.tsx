import React, { useEffect, useState } from 'react';
import {
  Send, RefreshCw, MessageSquare, Check, X, Clock, Plus, Pencil, Trash2,
  Copy, CheckCheck, ExternalLink, Search, FileText, Filter,
} from 'lucide-react';
import {
  getOutreach, getOutreachAnalytics, sendOutreachEmails, updateOutreachStatus,
  getEmailTemplates, getFollowUps, sendFollowUp, createInfluencer, updateInfluencer,
  deleteInfluencer, updateEmailTemplate, createEmailTemplate, deleteEmailTemplate,
  getInstagramStatus, searchInstagramHashtags, lookupInstagramProfile,
} from '../lib/api';
import { useAppStore } from '../store';
import { formatNumber, formatDate, getPlatformColor, getStatusColor, getPlatformIcon } from '../lib/utils';
import type { OutreachRecord } from '../types';

function Funnel3D({ stages }: { stages: { label: string; count: number; color: string }[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const W = 560;
  const H_PER = 100;
  const MAX_HALF = 210;
  const MIN_HALF = 48;
  const EY = 0.14;
  const PAD = 20;
  const cx = W / 2;
  const maxCount = stages[0]?.count || 1;
  const hw = (n: number) => Math.max(MIN_HALF, MAX_HALF * (n / maxCount));
  const totalH = PAD + stages.length * H_PER + 40;

  return (
    <svg viewBox={`0 0 ${W} ${totalH}`} className="w-full max-w-xl mx-auto select-none">
      <defs>
        {stages.map((s, i) => (
          <React.Fragment key={i}>
            <linearGradient id={`bd${i}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor={s.color} stopOpacity="0.5" />
              <stop offset="38%"  stopColor={s.color} stopOpacity="1" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.68" />
            </linearGradient>
            <radialGradient id={`tp${i}`} cx="50%" cy="35%" r="58%">
              <stop offset="0%"   stopColor="white"   stopOpacity="0.42" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.88" />
            </radialGradient>
          </React.Fragment>
        ))}
        <filter id="fshadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.22" />
        </filter>
      </defs>

      {stages.map((stage, i) => {
        const topY = PAD + i * H_PER;
        const botY = topY + H_PER;
        const hwT = hw(stage.count);
        const hwB = i < stages.length - 1 ? hw(stages[i + 1].count) : Math.max(MIN_HALF, hwT * 0.6);
        const ryT = hwT * EY;
        const ryB = hwB * EY;
        const active = hovered === i;
        const prevCount = i > 0 ? stages[i - 1].count : stage.count;
        const convPct = i > 0 && prevCount > 0
          ? ((stage.count / prevCount) * 100).toFixed(1) + '%'
          : null;

        return (
          <g key={stage.label}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={{ cursor: 'default', transition: 'opacity 0.15s' }}
            opacity={hovered !== null && !active ? 0.55 : 1}
            filter={active ? 'url(#fshadow)' : undefined}>

            {/* Body trapezoid */}
            <polygon
              points={`${cx-hwT},${topY} ${cx+hwT},${topY} ${cx+hwB},${botY} ${cx-hwB},${botY}`}
              fill={`url(#bd${i})`}
            />

            {/* Bottom ellipse for last stage (gives 3D cap feel) */}
            {i === stages.length - 1 && (
              <ellipse cx={cx} cy={botY} rx={hwB} ry={ryB}
                fill={stage.color} opacity="0.38" />
            )}

            {/* Top ellipse (lit rim — the key 3D cue) */}
            <ellipse cx={cx} cy={topY} rx={hwT} ry={ryT}
              fill={`url(#tp${i})`} />

            {/* Subtle glare streak on top ellipse */}
            <ellipse cx={cx - hwT * 0.16} cy={topY} rx={hwT * 0.25} ry={ryT * 0.52}
              fill="white" opacity={active ? 0.28 : 0.15} />

            {/* Label */}
            <text x={cx} y={topY + H_PER / 2 - 10} textAnchor="middle"
              fill="white" fontSize="11" fontWeight="700" letterSpacing="0.8"
              style={{ pointerEvents: 'none' }}>
              {stage.label.toUpperCase()}
            </text>
            {/* Count */}
            <text x={cx} y={topY + H_PER / 2 + 14} textAnchor="middle"
              fill="white" fontSize="24" fontWeight="800"
              style={{ pointerEvents: 'none' }}>
              {stage.count.toLocaleString()}
            </text>
            {/* Conversion rate */}
            {convPct && (
              <text x={cx} y={topY + H_PER / 2 + 32} textAnchor="middle"
                fill="white" fontSize="11" opacity="0.75"
                style={{ pointerEvents: 'none' }}>
                {convPct} conversion
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

const PLATFORMS = ['TikTok', 'YouTube', 'Instagram', 'RedNote'];
const BLANK_INF = { name: '', platform: 'Instagram', username: '', email: '', followers: '', avg_reel_views: '', category: '', country: '' };
const STATUS_ORDER = ['pending', 'sent', 'opened', 'replied', 'confirmed'];
const TEMPLATE_VARS = [
  { var: '{{name}}', desc: 'First name, or @username if no full name given' },
  { var: '{{username}}', desc: 'Handle without @' },
  { var: '{{platform}}', desc: 'Platform (Instagram, TikTok, etc.)' },
  { var: '{{sender_name}}', desc: 'Your name / team member name' },
];

function getPlatformUrl(platform: string, username: string): string {
  if (!username) return '';
  const handle = username.replace('@', '');
  switch (platform) {
    case 'Instagram': return `https://instagram.com/${handle}`;
    case 'TikTok': return `https://tiktok.com/@${handle}`;
    case 'YouTube': return `https://youtube.com/@${handle}`;
    case 'RedNote': return `https://xiaohongshu.com/user/profile/${handle}`;
    default: return `https://instagram.com/${handle}`;
  }
}

// If influencer has a full name (first + last), use first name.
// Otherwise fall back to @username (without @), or the single-word name.
function getGreetingName(name: string, username: string): string {
  const trimmed = (name || '').trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return parts[0];
  const handle = (username || '').replace('@', '');
  return handle || trimmed || 'there';
}

function renderDM(body: string, name: string, username: string, platform: string, senderName: string): string {
  const greeting = getGreetingName(name, username);
  const handle = (username || '').replace('@', '') || name;
  return (body || '')
    .replace(/\{\{name\}\}/g, greeting)
    .replace(/\{\{username\}\}/g, handle)
    .replace(/\{\{platform\}\}/g, platform)
    .replace(/\{\{sender_name\}\}/g, senderName || 'Our Team');
}

export default function Outreach() {
  const { activeCampaign, showToast } = useAppStore();
  const [activeTab, setActiveTab] = useState<'outreach' | 'discover'>('outreach');

  // ── Outreach tab ──
  const [records, setRecords] = useState<OutreachRecord[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMember, setFilterMember] = useState('');

  // ── Add / edit influencer ──
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState(BLANK_INF);
  const [addLoading, setAddLoading] = useState(false);
  const [lookupInput, setLookupInput] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [addMode, setAddMode] = useState<'single' | 'bulk'>('single');
  const [bulkText, setBulkText] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [editingInfluencer, setEditingInfluencer] = useState<any | null>(null);
  const [editForm, setEditForm] = useState(BLANK_INF);
  const [editLoading, setEditLoading] = useState(false);

  // ── Template manager ──
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [isNewTemplate, setIsNewTemplate] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);

  // ── DM modal ──
  const [showDmModal, setShowDmModal] = useState(false);
  const [dmRecords, setDmRecords] = useState<any[]>([]);
  const [sendForm, setSendForm] = useState({ template_id: '', follow_up_days: 3, team_member_id: '' });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ── Discover tab ──
  const [discoverMinFollowers, setDiscoverMinFollowers] = useState(500);
  const [discoverMaxFollowers, setDiscoverMaxFollowers] = useState(4000);
  const [discoverMinViews, setDiscoverMinViews] = useState(20000);
  const [discoverResults, setDiscoverResults] = useState<any[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverSelected, setDiscoverSelected] = useState<Set<string>>(new Set());
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashInput, setHashInput] = useState('');
  const [igStatus, setIgStatus] = useState<{ configured: boolean; connected: boolean; username: string | null } | null>(null);
  const [addingIg, setAddingIg] = useState<string | null>(null);

  // ── Loaders ──
  const load = async () => {
    const params: Record<string, string> = {};
    if (activeCampaign) params.campaign_id = activeCampaign.id;
    if (filterStatus) params.status = filterStatus;
    if (filterMember) params.team_member_id = filterMember;

    const [r, a, t, f] = await Promise.all([
      getOutreach(params),
      getOutreachAnalytics(activeCampaign ? { campaign_id: activeCampaign.id } : {}),
      getEmailTemplates(),
      getFollowUps(),
    ]);
    setRecords(r.data);
    setAnalytics(a.data);
    setTemplates(t.data);
    setFollowUps(f.data);
    if (t.data.length > 0 && !sendForm.template_id) {
      setSendForm(f => ({ ...f, template_id: t.data[0].id }));
    }
  };

  const handleDiscover = async () => {
    if (!hashtags.length) { showToast('Add at least one hashtag to search Instagram', 'info'); return; }
    if (!igStatus?.connected) { showToast('Connect Instagram first', 'info'); return; }
    setDiscoverLoading(true);
    setDiscoverResults([]);
    setDiscoverSelected(new Set());
    try {
      const res = await searchInstagramHashtags(hashtags, {
        min_followers: discoverMinFollowers,
        max_followers: discoverMaxFollowers,
        min_avg_views: discoverMinViews,
      });
      setDiscoverResults(res.data as any[]);
      if (!(res.data as any[]).length) showToast('No matching creators found — try different hashtags or broader criteria', 'info');
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Search failed', 'error');
    } finally {
      setDiscoverLoading(false);
    }
  };

  const addHashtag = (raw: string) => {
    const tag = raw.replace(/^#/, '').trim().toLowerCase();
    if (tag && !hashtags.includes(tag)) setHashtags(h => [...h, tag]);
    setHashInput('');
  };

  useEffect(() => {
    load();
    getInstagramStatus().then(r => setIgStatus(r.data)).catch(() => {});
  }, [activeCampaign, filterStatus, filterMember]);

  useEffect(() => {
    if (activeTab === 'discover') {
      getInstagramStatus().then(r => setIgStatus(r.data)).catch(() => {});
    }
  }, [activeTab]);

  // ── Outreach tab handlers ──
  const toggleAll = () => {
    if (selected.size === records.length) setSelected(new Set());
    else setSelected(new Set(records.map(r => r.id)));
  };
  const toggleOne = (id: string) => {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  const openEditInfluencer = (r: OutreachRecord) => {
    setEditingInfluencer(r);
    setEditForm({
      name: r.influencer_name,
      platform: r.platform,
      username: r.username || '',
      email: r.influencer_email || '',
      followers: String(r.followers || ''),
      avg_reel_views: String((r as any).avg_reel_views || ''),
      category: (r as any).category || '',
      country: (r as any).country || '',
    });
  };

  const handleEditInfluencer = async () => {
    if (!editingInfluencer) return;
    setEditLoading(true);
    try {
      await updateInfluencer(editingInfluencer.influencer_id, {
        ...editForm,
        followers: Number(editForm.followers) || 0,
        avg_reel_views: Number(editForm.avg_reel_views) || 0,
      });
      showToast('Influencer updated', 'success');
      setEditingInfluencer(null);
      load();
    } catch {
      showToast('Failed to update influencer', 'error');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteInfluencer = async (influencerId: string, name: string) => {
    if (!window.confirm(`Remove ${name}? This also deletes their outreach records.`)) return;
    try {
      await deleteInfluencer(influencerId);
      showToast(`${name} removed`, 'info');
      load();
    } catch {
      showToast('Failed to delete influencer', 'error');
    }
  };

  const handleLookupUsername = async () => {
    const username = lookupInput.replace('@', '').trim();
    if (!username) return;
    setLookupLoading(true);
    try {
      const res = await lookupInstagramProfile(username);
      const p = res.data as any;
      setAddForm(f => ({
        ...f,
        name: p.name || p.username,
        platform: 'Instagram',
        username: p.username,
        followers: String(p.followers_count || ''),
        avg_reel_views: String(p.avg_reel_views || ''),
      }));
      setLookupInput('');
      showToast(`Loaded @${p.username}`, 'success');
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Profile not found', 'error');
    } finally {
      setLookupLoading(false);
    }
  };

  const parseBulk = (text: string) => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const results: { username: string; followers: number }[] = [];
    let i = 0;
    while (i < lines.length) {
      const username = lines[i].replace(/^@/, '').trim();
      if (!username) { i++; continue; }
      const next = lines[i + 1];
      const isNumber = next && /^\d+$/.test(next.replace(/[,\s]/g, ''));
      results.push({ username, followers: isNumber ? Number(next.replace(/[^0-9]/g, '')) : 0 });
      i += isNumber ? 2 : 1;
    }
    return results;
  };

  const handleBulkAdd = async () => {
    const entries = parseBulk(bulkText);
    if (!entries.length) return showToast('No valid entries found', 'error');
    setBulkLoading(true);
    let added = 0;
    for (const e of entries) {
      try {
        await createInfluencer({ name: e.username, platform: addForm.platform, username: e.username, followers: e.followers, avg_reel_views: 0, category: '', country: '' });
        added++;
      } catch { /* skip duplicates/errors */ }
    }
    showToast(`Added ${added} of ${entries.length} influencers`, 'success');
    setBulkText('');
    setShowAddModal(false);
    setAddMode('single');
    setBulkLoading(false);
    load();
  };

  const handleAddInfluencer = async () => {
    if (!addForm.username) return showToast('Username is required', 'error');
    setAddLoading(true);
    try {
      const name = addForm.name || addForm.username.replace('@', '');
      await createInfluencer({ ...addForm, name, followers: Number(addForm.followers) || 0, avg_reel_views: Number(addForm.avg_reel_views) || 0 });
      showToast(`@${addForm.username} added!`, 'success');
      setAddForm(BLANK_INF);
      setShowAddModal(false);
      load();
    } finally {
      setAddLoading(false);
    }
  };

  const handleFollowUp = async (id: string) => {
    await sendFollowUp(id);
    showToast('Follow-up marked as sent', 'success');
    load();
  };

  const handleStatusChange = async (id: string, status: string, influencerId: string, campaignId?: string) => {
    // Optimistic update so the dropdown reflects the change immediately
    setRecords(prev => prev.map(r => r.influencer_id === influencerId ? { ...r, status: status as OutreachRecord['status'] } : r));
    try {
      const res = await updateOutreachStatus(id, status, influencerId, campaignId);
      if (res.data.pipeline_created) showToast('Confirmed — added to Pipeline & Content Schedule', 'success');
      load();
    } catch {
      showToast('Failed to update status', 'error');
      load(); // revert to server state
    }
  };

  // ── Template handlers ──
  const openNewTemplate = () => {
    setIsNewTemplate(true);
    setEditingTemplate({ id: '', name: 'New Template', subject: '', body: 'Hi {{name}},\n\n' });
    setShowTemplateManager(false);
  };

  const reloadTemplates = () =>
    getEmailTemplates().then(r => setTemplates(r.data)).catch(() => {});

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;
    setTemplateSaving(true);
    try {
      if (isNewTemplate) {
        await createEmailTemplate({ name: editingTemplate.name, subject: editingTemplate.subject || '', body: editingTemplate.body });
        showToast('Template created', 'success');
      } else {
        await updateEmailTemplate(editingTemplate.id, { name: editingTemplate.name, subject: editingTemplate.subject || '', body: editingTemplate.body });
        showToast('Template saved', 'success');
      }
      setEditingTemplate(null);
      setIsNewTemplate(false);
      reloadTemplates();
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Failed to save template', 'error');
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: string, name: string) => {
    if (!window.confirm(`Delete template "${name}"?`)) return;
    await deleteEmailTemplate(id);
    showToast('Template deleted', 'info');
    load();
  };

  // ── DM modal ──
  const openDmModal = (recs: any[]) => { setDmRecords(recs); setShowDmModal(true); };

  const handleMarkSent = async () => {
    if (!activeCampaign) return showToast('Select a campaign first', 'error');
    const ids = dmRecords.map(r => r.influencer_id || r.id);
    if (!ids.length) return;
    setLoading(true);
    try {
      await sendOutreachEmails({
        influencer_ids: ids,
        campaign_id: activeCampaign.id,
        team_member_id: sendForm.team_member_id || members[0]?.id,
        template_id: sendForm.template_id,
        follow_up_days: sendForm.follow_up_days,
      });
      showToast(`Marked ${ids.length} influencer${ids.length !== 1 ? 's' : ''} as DM sent`, 'success');
      setSelected(new Set());
      setDiscoverSelected(new Set());
      setShowDmModal(false);
      load();
      if (activeTab === 'discover') handleDiscover();
    } finally {
      setLoading(false);
    }
  };

  const copyDM = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ── Discover tab handlers ──
  const toggleDiscoverAll = () => {
    if (discoverSelected.size === discoverResults.length) setDiscoverSelected(new Set());
    else setDiscoverSelected(new Set(discoverResults.map(r => r.id)));
  };
  const toggleDiscoverOne = (id: string) => {
    setDiscoverSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  const handleAddFromIg = async (profile: any) => {
    setAddingIg(profile.id);
    try {
      await createInfluencer({
        name: profile.name || profile.username,
        platform: 'Instagram',
        username: profile.username,
        followers: profile.followers_count,
        avg_reel_views: profile.avg_reel_views,
        category: '',
        country: '',
      });
      showToast(`@${profile.username} added to dashboard!`, 'success');
      load();
    } catch { showToast('Failed to add', 'error'); }
    finally { setAddingIg(null); }
  };

  const prepareDiscoverDMs = () => {
    const sel = discoverResults.filter(r => discoverSelected.has(r.id));
    if (!sel.length) return showToast('Select at least one influencer', 'info');
    openDmModal(sel.map(r => ({
      id: r.id, influencer_id: r.id,
      influencer_name: r.name || r.username,
      username: r.username, platform: 'Instagram', followers: r.followers_count,
    })));
  };

  // ── Derived ──
  const members = analytics?.by_member || [];
  const totals = analytics?.totals || {};
  const responseRate = totals.total_sent > 0 ? ((totals.total_replied / totals.total_sent) * 100).toFixed(0) : 0;
  const selectedTemplate = templates.find(t => t.id === sendForm.template_id);

  const tabCls = (tab: 'outreach' | 'discover') =>
    `flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`;

  return (
    <div className="p-6 space-y-5">
      {/* ── Tab bar ── */}
      <div className="flex items-center border-b border-slate-200 -mb-1">
        <button className={tabCls('outreach')} onClick={() => setActiveTab('outreach')}>
          <Send size={14} /> Outreach
        </button>
        <button className={tabCls('discover')} onClick={() => setActiveTab('discover')}>
          <Search size={14} /> Discover
        </button>
        <div className="ml-auto pb-2">
          <button onClick={() => setShowTemplateManager(true)} className="btn-secondary flex items-center gap-1.5 text-xs">
            <FileText size={13} /> Templates
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════
          OUTREACH TAB
      ════════════════════════════════════════ */}
      {activeTab === 'outreach' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Total Contacted', value: totals.total_sent || 0, icon: <Send size={16} className="text-blue-500" /> },
              { label: 'Response Rate', value: `${responseRate}%`, icon: <MessageSquare size={16} className="text-yellow-500" /> },
              { label: 'Replied', value: totals.total_replied || 0, icon: <MessageSquare size={16} className="text-purple-500" /> },
              { label: 'Confirmed', value: totals.total_confirmed || 0, icon: <Check size={16} className="text-green-500" /> },
            ].map(stat => (
              <div key={stat.label} className="card p-4 flex items-center gap-3">
                <div className="w-9 h-9 bg-slate-50 rounded-lg flex items-center justify-center">{stat.icon}</div>
                <div>
                  <div className="text-xl font-bold text-slate-900">{stat.value}</div>
                  <div className="text-xs text-slate-500">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Funnel */}
          {records.length > 0 && (() => {
            const total = records.length;
            const replied = totals.total_replied || 0;
            const confirmed = totals.total_confirmed || 0;
            const funnelStages = [
              { label: 'Contacted', count: total, color: '#3b82f6' },
              { label: 'Replied', count: replied, color: '#f59e0b' },
              { label: 'Confirmed', count: confirmed, color: '#10b981' },
            ];
            return (
              <div className="card p-5">
                <div className="text-sm font-semibold text-slate-700 mb-1">Outreach Funnel</div>
                <div className="text-xs text-slate-400 mb-4">Hover each stage for conversion rate</div>
                <Funnel3D stages={funnelStages} />
              </div>
            );
          })()}

          {/* Team performance */}
          {members.length > 0 && (
            <div className="card p-4">
              <div className="text-sm font-semibold text-slate-700 mb-3">Team Performance</div>
              <div className="grid grid-cols-3 gap-3">
                {members.map((m: any) => (
                  <div key={m.id} className="bg-slate-50 rounded-lg p-3">
                    <div className="font-medium text-sm text-slate-800 mb-0.5">{m.name}</div>
                    <div className="text-xs text-slate-400 mb-1.5">{m.email}</div>
                    <div className="flex gap-3 text-xs text-slate-500">
                      <span><span className="font-semibold text-slate-700">{m.total_sent}</span> DMed</span>
                      <span><span className="font-semibold text-slate-700">{m.total_replied}</span> replied</span>
                      <span><span className="font-semibold text-green-600">{m.total_confirmed}</span> confirmed</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Follow-ups due */}
          {followUps.length > 0 && (
            <div className="card p-4 border-l-4 border-l-orange-400">
              <div className="flex items-center gap-2 mb-3">
                <Clock size={15} className="text-orange-500" />
                <span className="text-sm font-semibold text-slate-700">{followUps.length} Follow-ups Due</span>
              </div>
              <div className="space-y-2">
                {followUps.map(f => (
                  <div key={f.id} className="flex items-center justify-between">
                    <div className="text-sm text-slate-600">
                      <span className="font-medium text-slate-800">{f.influencer_name}</span>
                      {f.username && <span className="text-slate-400 ml-1">@{f.username}</span>}
                      {' · '}{f.team_member_name}
                    </div>
                    <button onClick={() => handleFollowUp(f.id)} className="btn-primary py-1 px-3 text-xs">
                      Mark Follow-up Sent
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Influencer table */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-700">Influencers ({records.length})</span>
                {selected.size > 0 && <span className="badge bg-blue-100 text-blue-700">{selected.size} selected</span>}
              </div>
              <div className="flex items-center gap-2">
                <select className="select text-xs py-1.5 w-32" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="">All Status</option>
                  {STATUS_ORDER.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
                <select className="select text-xs py-1.5 w-36" value={filterMember} onChange={e => setFilterMember(e.target.value)}>
                  <option value="">All Members</option>
                  {members.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <button onClick={() => { setAddForm(BLANK_INF); setLookupInput(''); setShowAddModal(true); }} className="btn-secondary flex items-center gap-1.5">
                  <Plus size={14} /> Add Influencer
                </button>
                <button
                  onClick={() => {
                    if (!selected.size) return showToast('Select influencers first', 'info');
                    openDmModal(records.filter(r => selected.has(r.id)));
                  }}
                  className="btn-primary flex items-center gap-1.5"
                >
                  <MessageSquare size={14} />
                  Prepare DMs {selected.size > 0 && `(${selected.size})`}
                </button>
              </div>
            </div>

            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="table-header w-10">
                    <input type="checkbox" checked={selected.size === records.length && records.length > 0} onChange={toggleAll} className="rounded border-slate-300" />
                  </th>
                  <th className="table-header">Influencer</th>
                  <th className="table-header">Platform</th>
                  <th className="table-header">Followers</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Team Member</th>
                  <th className="table-header">DM Sent</th>
                  <th className="table-header">Follow-up</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {records.map(r => (
                  <tr key={r.id} className={`hover:bg-slate-50 transition-colors ${selected.has(r.id) ? 'bg-blue-50' : ''}`}>
                    <td className="table-cell">
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} className="rounded border-slate-300" />
                    </td>
                    <td className="table-cell">
                      <div className="font-medium text-slate-900">{r.influencer_name}</div>
                      {r.username ? (
                        <a href={getPlatformUrl(r.platform, r.username)} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline flex items-center gap-0.5">
                          @{r.username} <ExternalLink size={10} />
                        </a>
                      ) : (
                        <div className="text-xs text-slate-400">{r.influencer_email || '—'}</div>
                      )}
                    </td>
                    <td className="table-cell">
                      <span className={`badge ${getPlatformColor(r.platform)}`}>{getPlatformIcon(r.platform)} {r.platform}</span>
                    </td>
                    <td className="table-cell text-slate-500">{formatNumber(r.followers)}</td>
                    <td className="table-cell">
                      <select value={r.status}
                        onChange={e => handleStatusChange(r.id, e.target.value, r.influencer_id, activeCampaign?.id)}
                        className={`badge border-0 cursor-pointer text-xs font-medium ${getStatusColor(r.status)}`}>
                        {STATUS_ORDER.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                      </select>
                    </td>
                    <td className="table-cell text-slate-500">{r.team_member_name}</td>
                    <td className="table-cell text-slate-500 text-xs">{r.sent_at ? formatDate(r.sent_at) : '—'}</td>
                    <td className="table-cell text-xs">
                      {r.follow_up_date ? (
                        <span className={`badge ${new Date(r.follow_up_date) < new Date() ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {formatDate(r.follow_up_date)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleFollowUp(r.id)} className="text-xs text-blue-600 hover:underline">Follow up</button>
                        <button onClick={() => openEditInfluencer(r)} className="p-1 text-slate-300 hover:text-blue-500 transition-colors"><Pencil size={13} /></button>
                        <button onClick={() => handleDeleteInfluencer(r.influencer_id, r.influencer_name)} className="p-1 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {records.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-12 text-slate-400 text-sm">No influencers yet — add one or use the Discover tab</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ════════════════════════════════════════
          DISCOVER TAB
      ════════════════════════════════════════ */}
      {activeTab === 'discover' && (
        <div className="space-y-4">

          {/* ── Apify status bar ── */}
          {igStatus && !igStatus.configured && (
            <div className="card p-4 flex items-start gap-3 border-l-4 border-l-pink-400">
              <div className="text-xl shrink-0">📸</div>
              <div className="min-w-0">
                <div className="font-semibold text-slate-800 text-sm mb-1">Add your Apify API key to enable Instagram search</div>
                <ol className="text-xs text-slate-500 space-y-1 list-decimal ml-4">
                  <li>Sign up free at <span className="font-mono text-slate-700">apify.com</span></li>
                  <li>Go to <span className="font-mono text-slate-700">apify.com/account/integrations</span> → copy your <strong>API token</strong></li>
                  <li>Add to your <span className="font-mono text-slate-700">.env</span> file: <code className="bg-slate-100 px-1 rounded">APIFY_API_KEY=apify_api_xxxx</code></li>
                  <li>Restart the server</li>
                </ol>
              </div>
            </div>
          )}
          {igStatus?.configured && (
            <div className="card px-4 py-2.5 flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <span className="text-slate-500">Apify connected — searches pull live from Instagram</span>
            </div>
          )}

          {/* ── Search criteria ── */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Filter size={15} className="text-slate-500" />
              <span className="text-sm font-semibold text-slate-700">Search Criteria</span>
              <span className="text-xs text-slate-400 ml-1">— pulls matching creators directly from Instagram</span>
            </div>

            {/* Numeric filters row */}
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Min Followers</label>
                <input type="number" className="input w-28 text-sm" value={discoverMinFollowers}
                  onChange={e => setDiscoverMinFollowers(Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Max Followers</label>
                <input type="number" className="input w-28 text-sm" value={discoverMaxFollowers}
                  onChange={e => setDiscoverMaxFollowers(Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Min Avg Reel Views</label>
                <input type="number" className="input w-36 text-sm" value={discoverMinViews}
                  onChange={e => setDiscoverMinViews(Number(e.target.value))} />
              </div>
              <button onClick={handleDiscover} disabled={discoverLoading || !igStatus?.connected}
                className="btn-primary flex items-center gap-1.5 self-end">
                {discoverLoading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                Search Instagram
              </button>
            </div>

            {/* Hashtag chip input */}
            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Hashtags <span className="text-slate-400 font-normal">— narrow down by niche (required)</span>
              </label>
              <div
                className="flex flex-wrap gap-1.5 border border-slate-200 rounded-xl px-3 py-2 min-h-[42px] bg-white focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-100 transition-all cursor-text"
                onClick={e => (e.currentTarget.querySelector('input') as HTMLInputElement)?.focus()}
              >
                {hashtags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-1 bg-pink-100 text-pink-700 text-xs font-medium px-2 py-0.5 rounded-full">
                    #{tag}
                    <button onClick={() => setHashtags(h => h.filter(t => t !== tag))} className="hover:text-pink-900">
                      <X size={9} />
                    </button>
                  </span>
                ))}
                <input
                  className="flex-1 min-w-[140px] outline-none text-sm text-slate-700 bg-transparent"
                  placeholder={hashtags.length ? 'Add more…' : '#nycfood  #chinatownnyc  #nycrestaurants…'}
                  value={hashInput}
                  onChange={e => setHashInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addHashtag(hashInput); }
                    if (e.key === 'Backspace' && !hashInput && hashtags.length) setHashtags(h => h.slice(0, -1));
                  }}
                  onBlur={() => { if (hashInput) addHashtag(hashInput); }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                Press <kbd className="bg-slate-100 px-1 rounded text-[10px]">Enter</kbd> or <kbd className="bg-slate-100 px-1 rounded text-[10px]">,</kbd> to add a tag · Up to 5 hashtags (Instagram API limit per week)
              </p>
            </div>
          </div>

          {/* ── Results ── */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-700">
                  {discoverLoading ? 'Searching Instagram…' : `${discoverResults.length} creator${discoverResults.length !== 1 ? 's' : ''} found`}
                </span>
                {discoverSelected.size > 0 && (
                  <span className="badge bg-blue-100 text-blue-700">{discoverSelected.size} selected</span>
                )}
              </div>
              {discoverSelected.size > 0 && (
                <button onClick={prepareDiscoverDMs} className="btn-primary flex items-center gap-1.5">
                  <MessageSquare size={14} /> Prepare DMs ({discoverSelected.size})
                </button>
              )}
            </div>

            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="table-header w-10">
                    <input type="checkbox"
                      checked={discoverSelected.size === discoverResults.length && discoverResults.length > 0}
                      onChange={toggleDiscoverAll} className="rounded border-slate-300" />
                  </th>
                  <th className="table-header">Creator</th>
                  <th className="table-header">Followers</th>
                  <th className="table-header">Avg Reel Views</th>
                  <th className="table-header">Bio</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {discoverLoading && (
                  <tr>
                    <td colSpan={6} className="text-center py-10">
                      <RefreshCw size={18} className="animate-spin text-slate-400 mx-auto mb-2" />
                      <div className="text-xs text-slate-400">Fetching creators from Instagram — this may take a few seconds…</div>
                    </td>
                  </tr>
                )}
                {!discoverLoading && discoverResults.map(r => (
                  <tr key={r.id} className={`hover:bg-slate-50 transition-colors ${discoverSelected.has(r.id) ? 'bg-blue-50' : ''}`}>
                    <td className="table-cell">
                      <input type="checkbox" checked={discoverSelected.has(r.id)}
                        onChange={() => toggleDiscoverOne(r.id)} className="rounded border-slate-300" />
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2.5">
                        {r.profile_picture_url && (
                          <img src={r.profile_picture_url} alt="" className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0" />
                        )}
                        <div>
                          <div className="font-medium text-slate-900 text-sm">{r.name || r.username}</div>
                          <a href={`https://instagram.com/${r.username}`} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:underline flex items-center gap-0.5">
                            @{r.username} <ExternalLink size={10} />
                          </a>
                        </div>
                      </div>
                    </td>
                    <td className="table-cell text-slate-600 text-sm">{formatNumber(r.followers_count)}</td>
                    <td className="table-cell">
                      <span className={`font-semibold text-sm ${r.avg_reel_views >= discoverMinViews ? 'text-green-600' : 'text-slate-400'}`}>
                        {r.avg_reel_views > 0 ? formatNumber(r.avg_reel_views) : '—'}
                      </span>
                      {r.reels_sampled > 0 && (
                        <div className="text-xs text-slate-400">{r.reels_sampled} reels sampled</div>
                      )}
                    </td>
                    <td className="table-cell text-slate-400 text-xs max-w-[200px]">
                      <div className="line-clamp-2">{r.biography || '—'}</div>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleAddFromIg(r)}
                          disabled={addingIg === r.id}
                          className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1"
                        >
                          {addingIg === r.id ? <RefreshCw size={11} className="animate-spin" /> : <Plus size={11} />}
                          Add
                        </button>
                        <button
                          onClick={() => openDmModal([{
                            id: r.id, influencer_id: r.id,
                            influencer_name: r.name || r.username,
                            username: r.username, platform: 'Instagram', followers: r.followers_count,
                          }])}
                          className="btn-primary py-1 px-2.5 text-xs flex items-center gap-1"
                        >
                          <MessageSquare size={11} /> DM
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!discoverLoading && discoverResults.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400 text-sm">
                      {!igStatus?.connected
                        ? 'Connect Instagram above to start searching'
                        : hashtags.length === 0
                          ? <>Add hashtags above (e.g. <span className="font-mono text-pink-500">#nycfood</span>) and click Search Instagram</>
                          : 'No creators matched your criteria — try different hashtags or broader follower/view ranges'
                      }
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          MODALS
      ════════════════════════════════════════ */}

      {/* Edit influencer */}
      {editingInfluencer && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Edit Influencer</h3>
              <button onClick={() => setEditingInfluencer(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
                <input className="input" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Platform *</label>
                  <select className="select w-full" value={editForm.platform} onChange={e => setEditForm(f => ({ ...f, platform: e.target.value }))}>
                    {PLATFORMS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                  <input className="input" placeholder="@handle" value={editForm.username} onChange={e => setEditForm(f => ({ ...f, username: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input className="input" type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Followers</label>
                  <input className="input" type="number" value={editForm.followers} onChange={e => setEditForm(f => ({ ...f, followers: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Avg Reel Views</label>
                  <input className="input" type="number" value={editForm.avg_reel_views} onChange={e => setEditForm(f => ({ ...f, avg_reel_views: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                  <input className="input" value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Country</label>
                  <input className="input" value={editForm.country} onChange={e => setEditForm(f => ({ ...f, country: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setEditingInfluencer(null)} className="btn-secondary">Cancel</button>
              <button onClick={handleEditInfluencer} disabled={editLoading} className="btn-primary flex items-center gap-2">
                {editLoading ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add influencer */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-slate-900">Add Influencer</h3>
                <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs">
                  <button onClick={() => setAddMode('single')} className={`px-3 py-1 rounded-md font-medium transition-colors ${addMode === 'single' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Single</button>
                  <button onClick={() => setAddMode('bulk')} className={`px-3 py-1 rounded-md font-medium transition-colors ${addMode === 'bulk' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Bulk</button>
                </div>
              </div>
              <button onClick={() => { setShowAddModal(false); setLookupInput(''); setAddForm(BLANK_INF); setBulkText(''); setAddMode('single'); }} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>

            {addMode === 'single' ? (
              <>
                {/* Username lookup */}
                {igStatus?.configured && (
                  <div className="px-5 pt-4 pb-3 border-b border-slate-100 bg-slate-50">
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      Lookup by Instagram username <span className="text-slate-400 font-normal">— auto-fills the form</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        className="input flex-1 text-sm"
                        placeholder="@username or username"
                        value={lookupInput}
                        onChange={e => setLookupInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleLookupUsername()}
                      />
                      <button onClick={handleLookupUsername} disabled={lookupLoading || !lookupInput.trim()} className="btn-primary px-3 flex items-center gap-1.5 text-sm shrink-0">
                        {lookupLoading ? <RefreshCw size={13} className="animate-spin" /> : <Search size={13} />}
                        Lookup
                      </button>
                    </div>
                  </div>
                )}
                <div className="p-5 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Username *</label>
                    <input className="input" placeholder="@handle" value={addForm.username} onChange={e => setAddForm(f => ({ ...f, username: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Followers</label>
                    <input className="input" type="number" placeholder="0" value={addForm.followers} onChange={e => setAddForm(f => ({ ...f, followers: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Platform</label>
                    <select className="select w-full" value={addForm.platform} onChange={e => setAddForm(f => ({ ...f, platform: e.target.value }))}>
                      {PLATFORMS.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-100">
                  <button onClick={() => setShowAddModal(false)} className="btn-secondary">Cancel</button>
                  <button onClick={handleAddInfluencer} disabled={addLoading} className="btn-primary flex items-center gap-2">
                    {addLoading ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                    Add Influencer
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="p-5 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Platform</label>
                    <select className="select w-full" value={addForm.platform} onChange={e => setAddForm(f => ({ ...f, platform: e.target.value }))}>
                      {PLATFORMS.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Paste list</label>
                    <div className="text-xs text-slate-400 mb-2">
                      Format: username on line 1, follower count on line 2, blank line between each:
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3 font-mono text-xs text-slate-500 mb-2 leading-relaxed">
                      @username1<br />5000<br /><br />@username2<br />3200
                    </div>
                    <textarea
                      className="input font-mono text-sm"
                      rows={10}
                      placeholder={'@username1\n5000\n\n@username2\n3200'}
                      value={bulkText}
                      onChange={e => setBulkText(e.target.value)}
                    />
                    {bulkText.trim() && (
                      <p className="text-xs text-slate-400 mt-1">
                        {parseBulk(bulkText).length} influencer{parseBulk(bulkText).length !== 1 ? 's' : ''} detected
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-100">
                  <button onClick={() => setShowAddModal(false)} className="btn-secondary">Cancel</button>
                  <button onClick={handleBulkAdd} disabled={bulkLoading || !bulkText.trim()} className="btn-primary flex items-center gap-2">
                    {bulkLoading ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                    Add {parseBulk(bulkText).length > 0 ? `${parseBulk(bulkText).length} ` : ''}Influencers
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Template manager */}
      {showTemplateManager && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
              <h3 className="font-semibold text-slate-900">DM Templates</h3>
              <div className="flex items-center gap-2">
                <button onClick={openNewTemplate} className="btn-primary flex items-center gap-1.5 text-sm">
                  <Plus size={13} /> New Template
                </button>
                <button onClick={() => setShowTemplateManager(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
              </div>
            </div>

            <div className="px-5 pt-4 pb-2 shrink-0">
              <div className="bg-blue-50 rounded-xl p-3 text-xs">
                <div className="font-semibold text-blue-800 mb-2">Template Variables</div>
                <div className="space-y-1">
                  {TEMPLATE_VARS.map(v => (
                    <div key={v.var} className="flex gap-2">
                      <code className="font-mono text-blue-700 shrink-0 w-36">{v.var}</code>
                      <span className="text-blue-600">{v.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 px-5 pb-5 space-y-2 mt-2">
              {templates.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-sm">No templates yet — create one above</div>
              )}
              {templates.map(t => (
                <div key={t.id} className="border border-slate-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 text-sm">{t.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5 line-clamp-2 whitespace-pre-line">{t.body}</div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => { setIsNewTemplate(false); setEditingTemplate({ ...t }); setShowTemplateManager(false); }}
                        className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1">
                        <Pencil size={11} /> Edit
                      </button>
                      <button onClick={() => handleDeleteTemplate(t.id, t.name)}
                        className="p-1.5 text-slate-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Template editor (create or edit) */}
      {editingTemplate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
              <h3 className="font-semibold text-slate-900">{isNewTemplate ? 'New DM Template' : 'Edit DM Template'}</h3>
              <button onClick={() => { setEditingTemplate(null); setIsNewTemplate(false); }} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Template Name</label>
                <input className="input" value={editingTemplate.name}
                  onChange={e => setEditingTemplate((t: any) => ({ ...t, name: e.target.value }))} />
              </div>
              <div className="bg-blue-50 rounded-xl p-3 text-xs">
                <div className="font-semibold text-blue-800 mb-1.5">Variables</div>
                <div className="flex flex-col gap-1">
                  {TEMPLATE_VARS.map(v => (
                    <span key={v.var}><code className="font-mono text-blue-700">{v.var}</code> <span className="text-blue-600">— {v.desc}</span></span>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Message Body</label>
                <textarea className="input font-mono text-sm" rows={16} value={editingTemplate.body}
                  onChange={e => setEditingTemplate((t: any) => ({ ...t, body: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-100 shrink-0">
              <button onClick={() => { setEditingTemplate(null); setIsNewTemplate(false); }} className="btn-secondary">Cancel</button>
              <button onClick={handleSaveTemplate} disabled={templateSaving} className="btn-primary flex items-center gap-2">
                {templateSaving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                {isNewTemplate ? 'Create Template' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DM prep modal */}
      {showDmModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
              <h3 className="font-semibold text-slate-900">
                Prepare DMs — {dmRecords.length} influencer{dmRecords.length !== 1 ? 's' : ''}
              </h3>
              <button onClick={() => setShowDmModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto flex-1">
              {/* Template + follow-up settings */}
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">DM Template</label>
                  <div className="flex gap-2">
                    <select className="select flex-1" value={sendForm.template_id}
                      onChange={e => setSendForm(f => ({ ...f, template_id: e.target.value }))}>
                      <option value="">— Select template —</option>
                      {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <button
                      onClick={() => { setShowTemplateManager(true); setShowDmModal(false); }}
                      className="btn-secondary px-3 flex items-center gap-1.5 shrink-0 text-xs"
                    >
                      <FileText size={13} /> Manage
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Follow-up in</label>
                  <div className="flex gap-1.5">
                    {[1, 3, 5, 7].map(d => (
                      <button key={d} onClick={() => setSendForm(f => ({ ...f, follow_up_days: d }))}
                        className={`px-2.5 py-1.5 rounded-lg text-sm border transition-colors ${sendForm.follow_up_days === d ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Per-influencer DM cards */}
              <div className="space-y-3">
                {dmRecords.map(r => {
                  const dmText = renderDM(
                    selectedTemplate?.body || '',
                    r.influencer_name,
                    r.username,
                    r.platform,
                    members[0]?.name || 'Our Team'
                  );
                  const profileUrl = getPlatformUrl(r.platform, r.username);
                  return (
                    <div key={r.id} className="border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">{r.influencer_name}</span>
                          {r.username && <span className="text-slate-400 text-sm">@{r.username}</span>}
                          <span className={`badge text-xs ${getPlatformColor(r.platform)}`}>
                            {getPlatformIcon(r.platform)} {r.platform}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          {profileUrl && (
                            <a href={profileUrl} target="_blank" rel="noopener noreferrer"
                              className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1">
                              <ExternalLink size={12} /> Open Profile
                            </a>
                          )}
                          <button onClick={() => copyDM(r.id, dmText)}
                            className="btn-primary py-1 px-2.5 text-xs flex items-center gap-1">
                            {copiedId === r.id ? <><CheckCheck size={12} /> Copied!</> : <><Copy size={12} /> Copy DM</>}
                          </button>
                        </div>
                      </div>
                      <pre className="text-xs text-slate-600 whitespace-pre-wrap bg-slate-50 rounded-lg p-3 font-sans leading-relaxed">
                        {dmText || '(No template selected — pick one above)'}
                      </pre>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between p-5 border-t border-slate-100 shrink-0">
              <p className="text-xs text-slate-400">Copy each DM → open profile → send → click Mark as Sent.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowDmModal(false)} className="btn-secondary">Close</button>
                <button onClick={handleMarkSent} disabled={loading} className="btn-primary flex items-center gap-2">
                  {loading ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                  Mark as Sent ({dmRecords.length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
