import React, { useEffect, useState } from 'react';
import { Send, RefreshCw, Mail, Eye, MessageSquare, Check, X, Clock, Plus, Wifi, WifiOff, Pencil, Trash2 } from 'lucide-react';
import { getOutreach, getOutreachAnalytics, sendOutreachEmails, updateOutreachStatus, getEmailTemplates, getFollowUps, sendFollowUp, createInfluencer, updateInfluencer, deleteInfluencer, getGmailAuthUrl, disconnectGmail, getGmailStatus, updateEmailTemplate } from '../lib/api';
import { useAppStore } from '../store';
import { formatNumber, formatDate, getPlatformColor, getStatusColor, getPlatformIcon } from '../lib/utils';
import type { OutreachRecord } from '../types';

const PLATFORMS = ['TikTok', 'YouTube', 'Instagram', 'RedNote'];
const BLANK_INF = { name: '', platform: 'TikTok', username: '', email: '', followers: '', category: '', country: '' };

const STATUS_ORDER = ['pending', 'sent', 'opened', 'replied', 'confirmed'];

export default function Outreach() {
  const { activeCampaign, showToast } = useAppStore();
  const [records, setRecords] = useState<OutreachRecord[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [connectedMemberIds, setConnectedMemberIds] = useState<Set<string>>(new Set());
  const [showSendModal, setShowSendModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingInfluencer, setEditingInfluencer] = useState<any | null>(null);
  const [editForm, setEditForm] = useState(BLANK_INF);
  const [editLoading, setEditLoading] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [addForm, setAddForm] = useState(BLANK_INF);
  const [addLoading, setAddLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMember, setFilterMember] = useState('');
  const [sendForm, setSendForm] = useState({ template_id: '', follow_up_days: 1, team_member_id: '' });

  const load = async () => {
    const params: Record<string, string> = {};
    if (activeCampaign) params.campaign_id = activeCampaign.id;
    if (filterStatus) params.status = filterStatus;
    if (filterMember) params.team_member_id = filterMember;

    const [r, a, t, f, gs] = await Promise.all([
      getOutreach(params),
      getOutreachAnalytics(activeCampaign ? { campaign_id: activeCampaign.id } : {}),
      getEmailTemplates(),
      getFollowUps(),
      getGmailStatus(),
    ]);
    setRecords(r.data);
    setAnalytics(a.data);
    setTemplates(t.data);
    setFollowUps(f.data);
    setConnectedMemberIds(new Set((gs.data.connectedMembers || []).map((m: any) => m.id)));
    if (t.data.length > 0 && !sendForm.template_id) {
      setSendForm(f => ({ ...f, template_id: t.data[0].id }));
    }
  };

  const handleConnectGmail = async (memberId: string) => {
    const res = await getGmailAuthUrl(memberId);
    window.location.href = res.data.url;
  };

  const handleDisconnectGmail = async (memberId: string) => {
    await disconnectGmail(memberId);
    showToast('Gmail disconnected', 'info');
    load();
  };

  const openEditInfluencer = (r: OutreachRecord) => {
    setEditingInfluencer(r);
    setEditForm({
      name: r.influencer_name,
      platform: r.platform,
      username: r.username || '',
      email: r.influencer_email || '',
      followers: String(r.followers || ''),
      category: (r as any).category || '',
      country: (r as any).country || '',
    });
  };

  const handleEditInfluencer = async () => {
    if (!editingInfluencer) return;
    setEditLoading(true);
    try {
      await updateInfluencer(editingInfluencer.influencer_id, { ...editForm, followers: Number(editForm.followers) || 0 });
      showToast('Influencer updated', 'success');
      setEditingInfluencer(null);
      load();
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteInfluencer = async (influencerId: string, name: string) => {
    if (!window.confirm(`Remove ${name} from the dashboard? This also deletes their outreach records.`)) return;
    await deleteInfluencer(influencerId);
    showToast(`${name} removed`, 'info');
    load();
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;
    setTemplateSaving(true);
    try {
      await updateEmailTemplate(editingTemplate.id, {
        name: editingTemplate.name,
        subject: editingTemplate.subject,
        body: editingTemplate.body,
      });
      showToast('Template saved', 'success');
      setEditingTemplate(null);
      load();
    } finally {
      setTemplateSaving(false);
    }
  };

  useEffect(() => { load(); }, [activeCampaign, filterStatus, filterMember]);

  const toggleAll = () => {
    if (selected.size === records.length) setSelected(new Set());
    else setSelected(new Set(records.map(r => r.id)));
  };

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    if (!selected.size) return showToast('Select at least one influencer', 'error');
    setLoading(true);
    try {
      const influencer_ids = records.filter(r => selected.has(r.id)).map(r => r.influencer_id);
      const res = await sendOutreachEmails({
        influencer_ids,
        campaign_id: activeCampaign?.id,
        team_member_id: sendForm.team_member_id || analytics?.by_member?.[0]?.id,
        template_id: sendForm.template_id,
        follow_up_days: sendForm.follow_up_days,
      });
      showToast(res.data.gmail_connected
        ? `Sent ${res.data.results.length} emails via Gmail ✓`
        : `Queued ${res.data.results.length} emails (Gmail not connected)`,
        res.data.gmail_connected ? 'success' : 'info'
      );
      setSelected(new Set());
      setShowSendModal(false);
      load();
    } finally {
      setLoading(false);
    }
  };

  const handleAddInfluencer = async () => {
    if (!addForm.name || !addForm.platform) return showToast('Name and platform are required', 'error');
    setAddLoading(true);
    try {
      await createInfluencer({ ...addForm, followers: Number(addForm.followers) || 0 });
      showToast(`${addForm.name} added!`, 'success');
      setAddForm(BLANK_INF);
      setShowAddModal(false);
      load();
    } finally {
      setAddLoading(false);
    }
  };

  const handleFollowUp = async (id: string) => {
    await sendFollowUp(id);
    showToast('Follow-up sent', 'success');
    load();
  };

  const handleStatusChange = async (id: string, status: string) => {
    const res = await updateOutreachStatus(id, status);
    if (res.data.pipeline_created) {
      showToast('Influencer confirmed — added to Pipeline automatically', 'success');
    }
    load();
  };

  const members = analytics?.by_member || [];
  const totals = analytics?.totals || {};
  const openRate = totals.total_sent > 0 ? ((totals.total_opened / totals.total_sent) * 100).toFixed(0) : 0;
  const replyRate = totals.total_sent > 0 ? ((totals.total_replied / totals.total_sent) * 100).toFixed(0) : 0;

  return (
    <div className="p-6 space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Contacted', value: totals.total_sent || 0, icon: <Mail size={16} className="text-blue-500" /> },
          { label: 'Email Open Rate', value: `${openRate}%`, icon: <Eye size={16} className="text-yellow-500" /> },
          { label: 'Reply Rate', value: `${replyRate}%`, icon: <MessageSquare size={16} className="text-purple-500" /> },
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

      {/* Team stats */}
      {members.length > 0 && (
        <div className="card p-4">
          <div className="text-sm font-semibold text-slate-700 mb-3">Team Performance</div>
          <div className="grid grid-cols-3 gap-3">
            {members.map((m: any) => {
              const isConnected = connectedMemberIds.has(m.id);
              return (
                <div key={m.id} className="bg-slate-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="font-medium text-sm text-slate-800">{m.name}</div>
                    <div className="flex items-center gap-1.5">
                      {isConnected ? (
                        <>
                          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                            <Wifi size={11} /> Gmail
                          </span>
                          <button
                            onClick={() => handleDisconnectGmail(m.id)}
                            title="Disconnect Gmail"
                            className="text-slate-400 hover:text-red-500 transition-colors"
                          >
                            <WifiOff size={11} />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleConnectGmail(m.id)}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                          title={`Connect ${m.email} to Gmail`}
                        >
                          <WifiOff size={11} /> Connect
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-slate-400 mb-1.5">{m.email}</div>
                  <div className="flex gap-3 text-xs text-slate-500">
                    <span><span className="font-semibold text-slate-700">{m.total_sent}</span> sent</span>
                    <span><span className="font-semibold text-slate-700">{m.total_opened}</span> opened</span>
                    <span><span className="font-semibold text-green-600">{m.total_confirmed}</span> confirmed</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Follow-ups pending */}
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
                  <span className="font-medium text-slate-800">{f.influencer_name}</span> · {f.team_member_name}
                </div>
                <button onClick={() => handleFollowUp(f.id)} className="btn-primary py-1 px-3 text-xs">
                  Send Follow-up
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-700">Influencers ({records.length})</span>
            {selected.size > 0 && (
              <span className="badge bg-blue-100 text-blue-700">{selected.size} selected</span>
            )}
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
            <button onClick={() => setShowAddModal(true)} className="btn-secondary flex items-center gap-1.5">
              <Plus size={14} /> Add Influencer
            </button>
            <button
              onClick={() => { if (selected.size > 0) setShowSendModal(true); else showToast('Select influencers first', 'info'); }}
              className="btn-primary flex items-center gap-1.5"
            >
              <Send size={14} />
              Send Email {selected.size > 0 && `(${selected.size})`}
            </button>
          </div>
        </div>

        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="table-header w-10">
                <input type="checkbox" checked={selected.size === records.length && records.length > 0}
                  onChange={toggleAll} className="rounded border-slate-300" />
              </th>
              <th className="table-header">Influencer</th>
              <th className="table-header">Platform</th>
              <th className="table-header">Followers</th>
              <th className="table-header">Status</th>
              <th className="table-header">Team Member</th>
              <th className="table-header">Sent</th>
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
                  <div className="text-xs text-slate-400">{r.influencer_email}</div>
                </td>
                <td className="table-cell">
                  <span className={`badge ${getPlatformColor(r.platform)}`}>
                    {getPlatformIcon(r.platform)} {r.platform}
                  </span>
                </td>
                <td className="table-cell text-slate-500">{formatNumber(r.followers)}</td>
                <td className="table-cell">
                  <select
                    value={r.status}
                    onChange={e => handleStatusChange(r.id, e.target.value)}
                    className={`badge border-0 cursor-pointer text-xs font-medium ${getStatusColor(r.status)}`}
                  >
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
                    <button onClick={() => handleFollowUp(r.id)} className="text-xs text-blue-600 hover:underline">
                      Follow up
                    </button>
                    <button onClick={() => openEditInfluencer(r)} className="p-1 text-slate-300 hover:text-blue-500 transition-colors" title="Edit influencer">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => handleDeleteInfluencer(r.influencer_id, r.influencer_name)} className="p-1 text-slate-300 hover:text-red-500 transition-colors" title="Remove influencer">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr><td colSpan={9} className="text-center py-12 text-slate-400 text-sm">No outreach records found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Influencer Modal */}
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                  <input className="input" value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Country</label>
                <input className="input" value={editForm.country} onChange={e => setEditForm(f => ({ ...f, country: e.target.value }))} />
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

      {/* Add Influencer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Add Influencer</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
                <input className="input" placeholder="e.g. G Loh" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Platform *</label>
                  <select className="select w-full" value={addForm.platform} onChange={e => setAddForm(f => ({ ...f, platform: e.target.value }))}>
                    {PLATFORMS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                  <input className="input" placeholder="@handle" value={addForm.username} onChange={e => setAddForm(f => ({ ...f, username: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input className="input" type="email" placeholder="influencer@gmail.com" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Followers</label>
                  <input className="input" type="number" placeholder="0" value={addForm.followers} onChange={e => setAddForm(f => ({ ...f, followers: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                  <input className="input" placeholder="e.g. Lifestyle" value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Country</label>
                <input className="input" placeholder="e.g. US" value={addForm.country} onChange={e => setAddForm(f => ({ ...f, country: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setShowAddModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleAddInfluencer} disabled={addLoading} className="btn-primary flex items-center gap-2">
                {addLoading ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                Add Influencer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Editor Modal */}
      {editingTemplate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
              <h3 className="font-semibold text-slate-900">Edit Template</h3>
              <button onClick={() => setEditingTemplate(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Template Name</label>
                <input className="input" value={editingTemplate.name}
                  onChange={e => setEditingTemplate((t: any) => ({ ...t, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Subject Line</label>
                <input className="input" value={editingTemplate.subject}
                  onChange={e => setEditingTemplate((t: any) => ({ ...t, subject: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Body
                  <span className="ml-2 text-xs font-normal text-slate-400">Use {'{{name}}'}, {'{{platform}}'}, {'{{sender_name}}'}</span>
                </label>
                <textarea className="input font-mono text-sm" rows={16} value={editingTemplate.body}
                  onChange={e => setEditingTemplate((t: any) => ({ ...t, body: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-100 shrink-0">
              <button onClick={() => setEditingTemplate(null)} className="btn-secondary">Cancel</button>
              <button onClick={handleSaveTemplate} disabled={templateSaving} className="btn-primary flex items-center gap-2">
                {templateSaving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Modal */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Send Emails to {selected.size} Influencer{selected.size > 1 ? 's' : ''}</h3>
              <button onClick={() => setShowSendModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Template</label>
                <div className="flex gap-2">
                  <select className="select flex-1" value={sendForm.template_id} onChange={e => setSendForm(f => ({ ...f, template_id: e.target.value }))}>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name} — {t.subject}</option>)}
                  </select>
                  {sendForm.template_id && (
                    <button
                      onClick={() => {
                        const t = templates.find(t => t.id === sendForm.template_id);
                        if (t) { setEditingTemplate({ ...t }); setShowSendModal(false); }
                      }}
                      className="btn-secondary px-3 flex items-center gap-1.5 shrink-0"
                      title="Edit template"
                    >
                      <Pencil size={14} /> Edit
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Sender (Team Member)</label>
                <select className="select" value={sendForm.team_member_id} onChange={e => setSendForm(f => ({ ...f, team_member_id: e.target.value }))}>
                  <option value="">Auto (first connected account)</option>
                  {members.map((m: any) => {
                    const isConn = connectedMemberIds.has(m.id);
                    return (
                      <option key={m.id} value={m.id}>
                        {isConn ? '✓ ' : '✗ '}{m.name} — {m.email || 'No email'}{!isConn ? ' (Gmail not connected)' : ''}
                      </option>
                    );
                  })}
                </select>
                {sendForm.team_member_id && !connectedMemberIds.has(sendForm.team_member_id) && (
                  <p className="text-xs text-amber-600 mt-1">
                    This member's Gmail is not connected — email will not send. Connect their Gmail in Team Performance above.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Auto Follow-up (days after sending)</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 5, 7].map(d => (
                    <button key={d} onClick={() => setSendForm(f => ({ ...f, follow_up_days: d }))}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${sendForm.follow_up_days === d ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      {d}d
                    </button>
                  ))}
                  <input type="number" value={sendForm.follow_up_days} onChange={e => setSendForm(f => ({ ...f, follow_up_days: +e.target.value }))}
                    className="input w-16 text-center" min={1} max={30} />
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-xs text-slate-500">Selected influencers:</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {records.filter(r => selected.has(r.id)).slice(0, 6).map(r => (
                    <span key={r.id} className="badge bg-blue-100 text-blue-700">{r.influencer_name}</span>
                  ))}
                  {selected.size > 6 && <span className="badge bg-slate-100 text-slate-500">+{selected.size - 6} more</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setShowSendModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleSend} disabled={loading} className="btn-primary flex items-center gap-2">
                {loading ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                Send Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
