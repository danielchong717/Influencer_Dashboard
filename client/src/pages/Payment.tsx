import React, { useEffect, useState } from 'react';
import { CheckCircle, Clock, DollarSign, TrendingUp, RefreshCw, Check, X, Plus, Trash2 } from 'lucide-react';
import { getPayments, getPaymentOverview, updatePaymentStatus, createPayment, getInfluencers } from '../lib/api';
import { useAppStore } from '../store';
import { formatCurrency, formatDate, getPlatformColor, getPlatformIcon } from '../lib/utils';
import type { Payment, PaymentOverview } from '../types';

const CURRENCIES = ['MYR', 'USD', 'SGD', 'GBP', 'EUR'];
const BLANK_FORM = { influencer_id: '', amount: '', currency: 'MYR', payment_method: '' };

export default function PaymentPage() {
  const { activeCampaign, showToast } = useAppStore();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [overview, setOverview] = useState<PaymentOverview | null>(null);
  const [influencers, setInfluencers] = useState<any[]>([]);
  const [updating, setUpdating] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<Payment | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState(BLANK_FORM);
  const [addLoading, setAddLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    const params: Record<string, string> = {};
    if (activeCampaign) params.campaign_id = activeCampaign.id;
    const [p, o, infs] = await Promise.all([
      getPayments(params),
      getPaymentOverview(params),
      getInfluencers(),
    ]);
    setPayments(p.data);
    setOverview(o.data);
    setInfluencers(infs.data);
  };

  useEffect(() => { load(); }, [activeCampaign]);

  const handleMarkPaid = async (payment: Payment) => {
    setUpdating(payment.id);
    try {
      const res = await updatePaymentStatus(payment.id, 'paid');
      if (res.data.email_sent) {
        showToast(`Payment confirmed! Confirmation email sent to ${payment.influencer_name}.`, 'success');
      } else {
        showToast('Payment marked as paid.', 'success');
      }
      setConfirmModal(null);
      load();
    } catch {
      showToast('Failed to update payment', 'error');
    } finally {
      setUpdating(null);
    }
  };

  const handleMarkPending = async (id: string) => {
    setUpdating(id);
    try {
      await updatePaymentStatus(id, 'pending');
      showToast('Payment reverted to pending', 'info');
      load();
    } finally {
      setUpdating(null);
    }
  };

  const handleAddPayment = async () => {
    if (!addForm.influencer_id || !addForm.amount) {
      return showToast('Influencer and amount are required', 'error');
    }
    if (isNaN(Number(addForm.amount)) || Number(addForm.amount) <= 0) {
      return showToast('Enter a valid amount', 'error');
    }
    setAddLoading(true);
    try {
      await createPayment({
        influencer_id: addForm.influencer_id,
        campaign_id: activeCampaign?.id,
        amount: Number(addForm.amount),
        currency: addForm.currency,
        payment_method: addForm.payment_method || null,
      });
      showToast('Payment record created', 'success');
      setAddForm(BLANK_FORM);
      setShowAddModal(false);
      load();
    } finally {
      setAddLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteId(id);
    try {
      await fetch(`/api/payment/${id}`, { method: 'DELETE' });
      showToast('Payment deleted', 'info');
      load();
    } finally {
      setDeleteId(null);
    }
  };

  // Influencers that already have a payment record in this campaign
  const existingInfluencerIds = new Set(payments.map(p => p.influencer_id));

  return (
    <div className="p-6 space-y-5">
      {/* Overview */}
      {overview && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total Budget', value: formatCurrency(overview.total_amount), icon: <DollarSign size={16} className="text-slate-500" />, bg: 'bg-slate-50' },
            { label: 'Paid', value: formatCurrency(overview.paid_amount), icon: <CheckCircle size={16} className="text-green-500" />, bg: 'bg-green-50', extra: `${overview.paid_count} payments` },
            { label: 'Pending', value: formatCurrency(overview.pending_amount), icon: <Clock size={16} className="text-yellow-500" />, bg: 'bg-yellow-50', extra: `${overview.pending_count} payments` },
            { label: 'Completion', value: overview.total_count > 0 ? `${Math.round((overview.paid_count / overview.total_count) * 100)}%` : '0%', icon: <TrendingUp size={16} className="text-blue-500" />, bg: 'bg-blue-50' },
          ].map(s => (
            <div key={s.label} className="card p-4 flex items-center gap-3">
              <div className={`w-9 h-9 ${s.bg} rounded-lg flex items-center justify-center`}>{s.icon}</div>
              <div>
                <div className="text-xl font-bold text-slate-900">{s.value}</div>
                <div className="text-xs text-slate-500">{s.label}</div>
                {s.extra && <div className="text-xs text-slate-400">{s.extra}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">Payments ({payments.length})</span>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary flex items-center gap-1.5"
          >
            <Plus size={14} /> Add Payment
          </button>
        </div>

        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="table-header">Influencer</th>
              <th className="table-header">Platform</th>
              <th className="table-header">Amount</th>
              <th className="table-header">Method</th>
              <th className="table-header">Status</th>
              <th className="table-header">Payment Date</th>
              <th className="table-header">Confirmation</th>
              <th className="table-header">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {payments.map(p => (
              <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                <td className="table-cell">
                  <div className="font-medium text-slate-900">{p.influencer_name}</div>
                  <div className="text-xs text-slate-400">{p.influencer_email}</div>
                </td>
                <td className="table-cell">
                  <span className={`badge ${getPlatformColor(p.platform)}`}>
                    {getPlatformIcon(p.platform)} {p.platform}
                  </span>
                </td>
                <td className="table-cell">
                  <span className="font-semibold text-slate-900">{formatCurrency(p.amount, p.currency)}</span>
                </td>
                <td className="table-cell text-slate-500 text-xs">
                  {p.payment_method || '—'}
                </td>
                <td className="table-cell">
                  <span className={`badge ${p.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {p.status === 'paid' ? '✓ Paid' : '⏳ Pending'}
                  </span>
                </td>
                <td className="table-cell text-slate-500">
                  {p.payment_date ? formatDate(p.payment_date) : '—'}
                </td>
                <td className="table-cell">
                  {p.confirmation_sent ? (
                    <span className="badge bg-green-50 text-green-600 text-xs">Email sent ✓</span>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </td>
                <td className="table-cell">
                  <div className="flex items-center gap-2">
                    {p.status === 'pending' ? (
                      <button
                        onClick={() => setConfirmModal(p)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors"
                      >
                        <Check size={12} /> Mark Paid
                      </button>
                    ) : (
                      <button
                        onClick={() => handleMarkPending(p.id)}
                        disabled={updating === p.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded-lg transition-colors"
                      >
                        {updating === p.id ? <RefreshCw size={12} className="animate-spin" /> : <X size={12} />}
                        Revert
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(p.id)}
                      disabled={deleteId === p.id}
                      className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                      title="Delete payment"
                    >
                      {deleteId === p.id ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr><td colSpan={8} className="text-center py-12 text-slate-400 text-sm">No payment records yet — click Add Payment to create one</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Payment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Add Payment</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Influencer *</label>
                <select
                  className="select"
                  value={addForm.influencer_id}
                  onChange={e => setAddForm(f => ({ ...f, influencer_id: e.target.value }))}
                >
                  <option value="">Select influencer...</option>
                  {influencers.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.name} — {i.platform}{existingInfluencerIds.has(i.id) ? ' (payment exists)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Amount *</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={addForm.amount}
                    onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Currency</label>
                  <select
                    className="select"
                    value={addForm.currency}
                    onChange={e => setAddForm(f => ({ ...f, currency: e.target.value }))}
                  >
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Payment Method</label>
                <input
                  className="input"
                  placeholder="e.g. Bank Transfer, PayPal, Cash"
                  value={addForm.payment_method}
                  onChange={e => setAddForm(f => ({ ...f, payment_method: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setShowAddModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleAddPayment} disabled={addLoading} className="btn-primary flex items-center gap-2">
                {addLoading ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                Add Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Paid Modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="p-6 text-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={28} className="text-green-600" />
              </div>
              <h3 className="font-semibold text-slate-900 text-lg mb-1">Confirm Payment</h3>
              <p className="text-sm text-slate-500 mb-2">
                Mark <span className="font-medium text-slate-700">{confirmModal.influencer_name}</span> as paid?
              </p>
              <p className="text-2xl font-bold text-slate-900 mb-1">{formatCurrency(confirmModal.amount, confirmModal.currency)}</p>
              <p className="text-xs text-slate-400 mb-5">A payment confirmation email will be automatically sent via Gmail.</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmModal(null)} className="btn-secondary flex-1">Cancel</button>
                <button
                  onClick={() => handleMarkPaid(confirmModal)}
                  disabled={updating === confirmModal.id}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium text-sm rounded-lg transition-colors"
                >
                  {updating === confirmModal.id ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                  Confirm & Send Email
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
