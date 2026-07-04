import React, { useState } from 'react';
import { Wifi, WifiOff, ChevronDown, Bell, Plus, X, Check, Pencil, Trash2, RefreshCw, Menu } from 'lucide-react';
import { useAppStore } from '../../store';
import { getGmailAuthUrl, disconnectGmail, createCampaign, updateCampaign, deleteCampaign, getCampaigns } from '../../lib/api';

const TAB_TITLES: Record<string, string> = {
  overview: '总览',
  outreach: '触达',
  pipeline: '流水线',
  content: '内容排期',
  payment: '付款',
  report: '报表',
  longterm: '长期合作',
};

const BLANK_CAMPAIGN = { name: '', start_date: '', end_date: '', budget: '', status: 'active' };

export default function Header() {
  const { activeTab, gmailConnected, gmailEmail, activeCampaign, campaigns, setActiveCampaign, setCampaigns, showToast, setGmailConnected, setSidebarOpen } = useAppStore();
  const [showCampaignDrop, setShowCampaignDrop] = useState(false);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<any | null>(null);
  const [campaignForm, setCampaignForm] = useState(BLANK_CAMPAIGN);
  const [saving, setSaving] = useState(false);

  const reloadCampaigns = async () => {
    const res = await getCampaigns();
    setCampaigns(res.data);
    return res.data;
  };

  const handleConnectGmail = async () => {
    const { data } = await getGmailAuthUrl();
    window.location.href = data.url;
  };

  const handleDisconnect = async () => {
    await disconnectGmail();
    setGmailConnected(false);
    showToast('Gmail disconnected', 'info');
  };

  const openNewCampaign = () => {
    setEditingCampaign(null);
    setCampaignForm(BLANK_CAMPAIGN);
    setShowCampaignDrop(false);
    setShowCampaignModal(true);
  };

  const openEditCampaign = (c: any) => {
    setEditingCampaign(c);
    setCampaignForm({ name: c.name, start_date: c.start_date || '', end_date: c.end_date || '', budget: c.budget?.toString() || '', status: c.status });
    setShowCampaignDrop(false);
    setShowCampaignModal(true);
  };

  const handleSaveCampaign = async () => {
    if (!campaignForm.name.trim()) return showToast('Campaign name is required', 'error');
    setSaving(true);
    try {
      const payload = { ...campaignForm, budget: Number(campaignForm.budget) || 0 };
      if (editingCampaign) {
        await updateCampaign(editingCampaign.id, payload);
        showToast('Campaign updated', 'success');
      } else {
        const res = await createCampaign(payload);
        const updated = await reloadCampaigns();
        const newC = updated.find((c: any) => c.id === res.data.id);
        if (newC) setActiveCampaign(newC);
        showToast('Campaign created', 'success');
      }
      await reloadCampaigns();
      setShowCampaignModal(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    await deleteCampaign(id);
    const updated = await reloadCampaigns();
    if (activeCampaign?.id === id) setActiveCampaign(updated[0] || null);
    showToast('Campaign deleted', 'info');
    setShowCampaignDrop(false);
  };

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0">
      <div className="flex items-center gap-3">
        <button onClick={() => setSidebarOpen(true)} className="md:hidden -ml-2 p-2 text-slate-500 hover:text-slate-800" aria-label="菜单">
          <Menu size={20} />
        </button>
        <h1 className="text-base font-semibold text-slate-900">{TAB_TITLES[activeTab]}</h1>
        {activeCampaign && (
          <span className="text-xs text-slate-400">/ {activeCampaign.name}</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Campaign selector */}
        <div className="relative">
          <button
            onClick={() => setShowCampaignDrop(!showCampaignDrop)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <span className="truncate max-w-[140px]">{activeCampaign?.name || '全部餐厅'}</span>
            <ChevronDown size={14} />
          </button>
          {showCampaignDrop && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowCampaignDrop(false)} />
              <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 min-w-[220px]">
                <button
                  onClick={() => { setActiveCampaign(null); setShowCampaignDrop(false); }}
                  className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-slate-50 border-b border-slate-100"
                >
                  <span className="truncate">全部餐厅 / All</span>
                  {!activeCampaign && <Check size={12} className="text-blue-600 shrink-0" />}
                </button>
                {/* Read-only mirror: campaigns mirror Feishu restaurants, so create/edit/delete
                    are hidden here (local edits get overwritten on next sync). Select only. */}
                {campaigns.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { setActiveCampaign(c); setShowCampaignDrop(false); }}
                    className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-slate-50"
                  >
                    <span className="truncate">{c.name}</span>
                    {activeCampaign?.id === c.id && <Check size={12} className="text-blue-600 shrink-0" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Gmail status — 已隐藏:看板「从面板发外联邮件」功能已关(主从:飞书=唯一源头,
            邮件博主对接在云端 email/sync.py 跑,与此按钮无关)。把 false 改回 true 即恢复。 */}
        {false && (gmailConnected ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs border border-green-200">
              <Wifi size={12} />
              <span className="truncate max-w-[120px]">{gmailEmail || '已连接 Gmail'}</span>
            </div>
            <button onClick={handleDisconnect} className="text-xs text-slate-400 hover:text-red-500 transition-colors">断开</button>
          </div>
        ) : (
          <button
            onClick={handleConnectGmail}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs border border-blue-200 hover:bg-blue-100 transition-colors"
          >
            <WifiOff size={12} />
            连接 Gmail
          </button>
        ))}

        <button className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
          <Bell size={16} />
        </button>
      </div>

      {/* Campaign Create/Edit Modal */}
      {showCampaignModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">{editingCampaign ? 'Edit Campaign' : 'New Campaign'}</h3>
              <button onClick={() => setShowCampaignModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Campaign Name *</label>
                <input className="input" placeholder="e.g. Summer 2026 Campaign" value={campaignForm.name}
                  onChange={e => setCampaignForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Start Date</label>
                  <input className="input" type="date" value={campaignForm.start_date}
                    onChange={e => setCampaignForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">End Date</label>
                  <input className="input" type="date" value={campaignForm.end_date}
                    onChange={e => setCampaignForm(f => ({ ...f, end_date: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Budget (USD)</label>
                  <input className="input" type="number" min="0" placeholder="0" value={campaignForm.budget}
                    onChange={e => setCampaignForm(f => ({ ...f, budget: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
                  <select className="select" value={campaignForm.status}
                    onChange={e => setCampaignForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setShowCampaignModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleSaveCampaign} disabled={saving} className="btn-primary flex items-center gap-2">
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                {editingCampaign ? 'Save Changes' : 'Create Campaign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
