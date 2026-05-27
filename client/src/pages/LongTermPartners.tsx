import React, { useEffect, useState } from 'react';
import { Star, Plus, Trash2, X, Check, RefreshCw, Calendar, TrendingUp } from 'lucide-react';
import { getLongTermPartners, signLongTermPartner, deleteLongTermPartner, getInfluencers } from '../lib/api';
import { useAppStore } from '../store';
import { formatCurrency, formatDate, formatNumber, getPlatformColor, getPlatformIcon, getInitials, getStatusColor } from '../lib/utils';
import type { LongTermPartner } from '../types';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function MonthPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const d = value ? new Date(value + '-01') : null;
  return (
    <div className="relative">
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      <button type="button" onClick={() => setOpen(!open)}
        className="input text-left flex items-center justify-between">
        <span>{d ? `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` : 'Select month'}</span>
        <Calendar size={14} className="text-slate-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 left-0 bg-white border border-slate-200 rounded-xl shadow-lg z-20 p-3 w-56">
            {[2026, 2027].map(year => (
              <div key={year} className="mb-2">
                <div className="text-xs font-semibold text-slate-500 mb-1 px-1">{year}</div>
                <div className="grid grid-cols-4 gap-1">
                  {MONTH_NAMES.map((m, i) => {
                    const v = `${year}-${String(i + 1).padStart(2, '0')}`;
                    return (
                      <button key={m} onClick={() => { onChange(v); setOpen(false); }}
                        className={`text-xs py-1 rounded-lg transition-colors ${value === v ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 text-slate-700'}`}>
                        {m}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function LongTermPartners() {
  const { showToast } = useAppStore();
  const [partners, setPartners] = useState<LongTermPartner[]>([]);
  const [influencers, setInfluencers] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    influencer_id: '',
    start_month: '',
    duration_months: 3,
    monthly_rate: 5000,
  });

  const load = async () => {
    const [p, i] = await Promise.all([getLongTermPartners(), getInfluencers()]);
    setPartners(p.data);
    const partnerIds = new Set(p.data.map((x: any) => x.influencer_id));
    setInfluencers(i.data.filter((inf: any) => !partnerIds.has(inf.id)));
  };

  useEffect(() => { load(); }, []);

  const handleSign = async () => {
    if (!form.influencer_id || !form.start_month) return showToast('Fill in all fields', 'error');
    setSaving(true);
    try {
      const start = new Date(form.start_month + '-01');
      const end = new Date(start);
      end.setMonth(end.getMonth() + form.duration_months);
      const end_date = end.toISOString().split('T')[0];

      await signLongTermPartner({
        influencer_id: form.influencer_id,
        start_date: start.toISOString().split('T')[0],
        end_date,
        monthly_rate: form.monthly_rate,
      });
      showToast('Long-term partnership signed!', 'success');
      setShowModal(false);
      setForm({ influencer_id: '', start_month: '', duration_months: 3, monthly_rate: 5000 });
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    await deleteLongTermPartner(id);
    showToast('Partnership removed', 'info');
    setDeleting(null);
    load();
  };

  const active = partners.filter(p => p.status === 'active');
  const totalSpend = partners.reduce((s, p) => s + (p.total_spend || 0), 0);

  return (
    <div className="p-6 space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-yellow-50 rounded-lg flex items-center justify-center">
            <Star size={16} className="text-yellow-500" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-900">{active.length}</div>
            <div className="text-xs text-slate-500">Active Partners</div>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center">
            <TrendingUp size={16} className="text-green-500" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-900">{formatCurrency(totalSpend)}</div>
            <div className="text-xs text-slate-500">Total Spend (LTPs)</div>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
            <Calendar size={16} className="text-blue-500" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-900">{partners.reduce((s, p) => s + (p.content_count || 0), 0)}</div>
            <div className="text-xs text-slate-500">Total Content Pieces</div>
          </div>
        </div>
      </div>

      {/* Partners table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <span className="text-sm font-semibold text-slate-700">Long-term Partners ({partners.length})</span>
          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-1.5">
            <Plus size={14} /> Sign New Partner
          </button>
        </div>

        {partners.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Star size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No long-term partners yet.</p>
            <p className="text-xs mt-1">Sign influencers with outstanding performance as long-term partners.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="table-header">Partner</th>
                <th className="table-header">Platform</th>
                <th className="table-header">Period</th>
                <th className="table-header">Monthly Rate</th>
                <th className="table-header">Total Spend</th>
                <th className="table-header">Content</th>
                <th className="table-header">Avg Score</th>
                <th className="table-header">Status</th>
                <th className="table-header"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {partners.map(p => {
                const startD = new Date(p.start_date);
                const endD = new Date(p.end_date);
                const totalMonths = Math.round((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24 * 30));
                const elapsed = Math.max(0, Math.min(totalMonths, Math.round((Date.now() - startD.getTime()) / (1000 * 60 * 60 * 24 * 30))));
                const pct = totalMonths > 0 ? Math.min((elapsed / totalMonths) * 100, 100) : 0;

                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-700 text-xs font-bold">
                          {getInitials(p.influencer_name || '')}
                        </div>
                        <div>
                          <div className="font-medium text-sm text-slate-900">{p.influencer_name}</div>
                          <div className="text-xs text-slate-400">{formatNumber((p as any).followers)} followers</div>
                        </div>
                      </div>
                    </td>
                    <td className="table-cell">
                      <span className={`badge ${getPlatformColor(p.platform)}`}>
                        {getPlatformIcon(p.platform)} {p.platform}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="text-xs text-slate-700">{formatDate(p.start_date)} – {formatDate(p.end_date)}</div>
                      <div className="mt-1 w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{elapsed}/{totalMonths} mo</div>
                    </td>
                    <td className="table-cell font-medium">{formatCurrency(p.monthly_rate)}/mo</td>
                    <td className="table-cell font-semibold text-slate-900">{formatCurrency(p.total_spend)}</td>
                    <td className="table-cell text-slate-600">{p.content_count} posts</td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1">
                        <Star size={12} className="text-yellow-400 fill-yellow-400" />
                        <span className="font-medium">{(p.avg_score || (p as any).latest_score || 0).toFixed(1)}</span>
                      </div>
                    </td>
                    <td className="table-cell">
                      <span className={`badge ${getStatusColor(p.status)}`}>{p.status}</span>
                    </td>
                    <td className="table-cell">
                      <button onClick={() => handleDelete(p.id)} disabled={deleting === p.id}
                        className="text-slate-300 hover:text-red-500 transition-colors">
                        {deleting === p.id ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Sign Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Sign Long-term Partner</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Influencer</label>
                <select className="select" value={form.influencer_id} onChange={e => setForm(f => ({ ...f, influencer_id: e.target.value }))}>
                  <option value="">Select influencer...</option>
                  {influencers.map(i => (
                    <option key={i.id} value={i.id}>{i.name} — {i.platform} ({formatNumber(i.followers)} followers)</option>
                  ))}
                </select>
              </div>
              <MonthPicker label="Start Month" value={form.start_month} onChange={v => setForm(f => ({ ...f, start_month: v }))} />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Duration (months)</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 6, 12].map(d => (
                    <button key={d} onClick={() => setForm(f => ({ ...f, duration_months: d }))}
                      className={`flex-1 py-2 rounded-lg text-sm border transition-colors ${form.duration_months === d ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      {d}mo
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Monthly Rate (USD)</label>
                <input type="number" className="input" value={form.monthly_rate}
                  onChange={e => setForm(f => ({ ...f, monthly_rate: +e.target.value }))} min={0} step={500} />
              </div>
              {form.influencer_id && form.start_month && (
                <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
                  Total value: <span className="font-semibold">{formatCurrency(form.monthly_rate * form.duration_months)}</span>
                  {' '}over {form.duration_months} month{form.duration_months > 1 ? 's' : ''}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleSign} disabled={saving} className="btn-primary flex items-center gap-2">
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                Sign Partner
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
