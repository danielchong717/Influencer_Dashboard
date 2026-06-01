import React, { useEffect, useState } from 'react';
import { Link, RefreshCw, Eye, Heart, MessageCircle, Share2, X, Check, ExternalLink, ClipboardEdit } from 'lucide-react';
import { getContent, updateVideoLink, fetchMetrics, updateMetricsManual } from '../lib/api';
import { useAppStore } from '../store';
import { formatNumber, formatDate, formatCurrency, getPlatformColor, getPlatformIcon, getStatusColor } from '../lib/utils';
import type { ContentItem } from '../types';

const BLANK_METRICS = { views_24h: '', views_7d: '', likes: '', comments: '', shares: '' };

export default function ContentSchedule() {
  const { activeCampaign, showToast } = useAppStore();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [videoModal, setVideoModal] = useState<ContentItem | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [fetchingId, setFetchingId] = useState<string | null>(null);
  const [metricsModal, setMetricsModal] = useState<ContentItem | null>(null);
  const [metricsForm, setMetricsForm] = useState(BLANK_METRICS);
  const [metricsSaving, setMetricsSaving] = useState(false);

  const load = async () => {
    const params: Record<string, string> = {};
    if (activeCampaign) params.campaign_id = activeCampaign.id;
    const res = await getContent(params);
    setItems(res.data);
  };

  useEffect(() => { load(); }, [activeCampaign]);

  const handleAddVideo = async () => {
    if (!videoModal || !videoUrl) return;
    setLoading(true);
    try {
      const res = await updateVideoLink(videoModal.id, videoUrl);
      const isYouTube = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be');
      const source = (res.data as any)?.source;
      showToast(
        isYouTube && source === 'youtube'
          ? 'YouTube metrics fetched in real-time'
          : 'Video saved. For non-YouTube platforms, use Enter Metrics to add stats manually.',
        'success'
      );
      setVideoModal(null);
      setVideoUrl('');
      setTimeout(load, 1200);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchMetrics = async (item: ContentItem) => {
    const isYouTube = (item.video_url || '').includes('youtube.com') || (item.video_url || '').includes('youtu.be');
    if (!isYouTube) {
      // Non-YouTube: open manual entry instead
      setMetricsModal(item);
      setMetricsForm({
        views_24h: String(item.views_24h || ''),
        views_7d: String(item.views_7d || ''),
        likes: String(item.likes || ''),
        comments: String(item.comments || ''),
        shares: String((item as any).shares || ''),
      });
      return;
    }
    setFetchingId(item.id);
    try {
      await fetchMetrics(item.id);
      showToast('YouTube metrics refreshed', 'success');
      load();
    } finally {
      setFetchingId(null);
    }
  };

  const handleSaveManualMetrics = async () => {
    if (!metricsModal) return;
    setMetricsSaving(true);
    try {
      await updateMetricsManual(metricsModal.id, {
        views_24h: Number(metricsForm.views_24h) || 0,
        views_7d: Number(metricsForm.views_7d) || 0,
        likes: Number(metricsForm.likes) || 0,
        comments: Number(metricsForm.comments) || 0,
        shares: Number(metricsForm.shares) || 0,
      });
      showToast('Metrics saved', 'success');
      setMetricsModal(null);
      load();
    } finally {
      setMetricsSaving(false);
    }
  };

  const published = items.filter(i => i.status === 'published');
  const scheduled = items.filter(i => i.status === 'scheduled');

  const totalViews24 = published.reduce((s, i) => s + (i.views_24h || 0), 0);
  const totalViews7d = published.reduce((s, i) => s + (i.views_7d || 0), 0);
  const avgEngagement = published.length
    ? (published.reduce((s, i) => s + (i.engagement_rate || 0), 0) / published.length).toFixed(1)
    : '0';

  return (
    <div className="p-6 space-y-5">
      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Published', value: published.length, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Scheduled', value: scheduled.length, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: '24h Total Views', value: formatNumber(totalViews24), color: 'text-slate-700', bg: 'bg-slate-50' },
          { label: 'Avg Engagement', value: `${avgEngagement}%`, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">Content Delivery ({items.length})</span>
          <span className="text-xs text-slate-400">YouTube metrics auto-fetch. TikTok/Instagram/RedNote: enter manually.</span>
        </div>

        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="table-header">Date</th>
              <th className="table-header">Influencer</th>
              <th className="table-header">Platform</th>
              <th className="table-header">Status</th>
              <th className="table-header">Price</th>
              <th className="table-header">Video Link</th>
              <th className="table-header"><div className="flex items-center gap-1"><Eye size={12} /> 24h Views</div></th>
              <th className="table-header"><div className="flex items-center gap-1"><Eye size={12} /> 7d Views</div></th>
              <th className="table-header"><div className="flex items-center gap-1"><Heart size={12} /> Likes</div></th>
              <th className="table-header">Engagement</th>
              <th className="table-header">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {items.map(item => {
              const isYouTube = (item.video_url || '').includes('youtube.com') || (item.video_url || '').includes('youtu.be');
              return (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="table-cell whitespace-nowrap">
                    <div className="font-medium text-slate-800 text-xs">{formatDate(item.scheduled_date)}</div>
                  </td>
                  <td className="table-cell">
                    <div className="font-medium text-slate-900">{item.influencer_name}</div>
                    <div className="text-xs text-slate-400">{item.username}</div>
                  </td>
                  <td className="table-cell">
                    <span className={`badge ${getPlatformColor(item.platform)}`}>
                      {getPlatformIcon(item.platform)} {item.platform}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span className={`badge ${getStatusColor(item.status)}`}>
                      {item.status === 'published' ? '✓ Published' : '⏳ Scheduled'}
                    </span>
                  </td>
                  <td className="table-cell text-slate-600">{formatCurrency(item.price)}</td>
                  <td className="table-cell">
                    {item.video_url ? (
                      <a href={item.video_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-600 hover:underline text-xs">
                        <ExternalLink size={11} /> View
                      </a>
                    ) : (
                      <button
                        onClick={() => { setVideoModal(item); setVideoUrl(''); }}
                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600 transition-colors border border-dashed border-slate-300 hover:border-blue-400 px-2 py-1 rounded"
                      >
                        <Link size={11} /> Add link
                      </button>
                    )}
                  </td>
                  <td className="table-cell">
                    {item.views_24h != null ? <span className="font-medium text-slate-800">{formatNumber(item.views_24h)}</span> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="table-cell">
                    {item.views_7d != null ? <span className="font-medium text-slate-800">{formatNumber(item.views_7d)}</span> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="table-cell">
                    {item.likes != null ? <span className="text-slate-600">{formatNumber(item.likes)}</span> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="table-cell">
                    {item.engagement_rate != null ? (
                      <span className={`font-medium ${item.engagement_rate > 5 ? 'text-green-600' : 'text-slate-600'}`}>
                        {item.engagement_rate.toFixed(1)}%
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="table-cell">
                    {item.video_url && (
                      <button
                        onClick={() => handleFetchMetrics(item)}
                        disabled={fetchingId === item.id}
                        title={isYouTube ? 'Refresh YouTube metrics' : 'Enter metrics manually'}
                        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                      >
                        {fetchingId === item.id
                          ? <RefreshCw size={11} className="animate-spin" />
                          : isYouTube ? <RefreshCw size={11} /> : <ClipboardEdit size={11} />}
                        {isYouTube ? 'Refresh' : 'Enter Metrics'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr><td colSpan={11} className="text-center py-12 text-slate-400 text-sm">No content scheduled yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Video Link Modal */}
      {videoModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Add Video Link</h3>
              <button onClick={() => setVideoModal(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-50 rounded-lg p-3 text-sm">
                <span className="text-slate-500">Influencer: </span>
                <span className="font-medium text-slate-800">{videoModal.influencer_name}</span>
                <span className="mx-2 text-slate-300">·</span>
                <span className="text-slate-500">{formatDate(videoModal.scheduled_date)}</span>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Video URL</label>
                <input type="url" className="input" placeholder="https://www.youtube.com/watch?v=... or TikTok/Instagram link"
                  value={videoUrl} onChange={e => setVideoUrl(e.target.value)} />
                <p className="text-xs text-slate-400 mt-1">
                  YouTube links auto-fetch real metrics. For TikTok, Instagram, and RedNote, use the Enter Metrics button after saving.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setVideoModal(null)} className="btn-secondary">Cancel</button>
              <button onClick={handleAddVideo} disabled={loading || !videoUrl} className="btn-primary flex items-center gap-2">
                {loading ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                Save & Fetch Metrics
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Metrics Entry Modal */}
      {metricsModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-slate-900">Enter Metrics</h3>
                <p className="text-xs text-slate-400 mt-0.5">{metricsModal.influencer_name} · {metricsModal.platform}</p>
              </div>
              <button onClick={() => setMetricsModal(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
                Copy the numbers directly from your {metricsModal.platform} analytics dashboard and paste them here.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Views (24h)</label>
                  <input className="input" type="number" min="0" placeholder="0" value={metricsForm.views_24h}
                    onChange={e => setMetricsForm(f => ({ ...f, views_24h: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Views (7d)</label>
                  <input className="input" type="number" min="0" placeholder="0" value={metricsForm.views_7d}
                    onChange={e => setMetricsForm(f => ({ ...f, views_7d: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Likes</label>
                  <input className="input" type="number" min="0" placeholder="0" value={metricsForm.likes}
                    onChange={e => setMetricsForm(f => ({ ...f, likes: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Comments</label>
                  <input className="input" type="number" min="0" placeholder="0" value={metricsForm.comments}
                    onChange={e => setMetricsForm(f => ({ ...f, comments: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Shares</label>
                  <input className="input" type="number" min="0" placeholder="0" value={metricsForm.shares}
                    onChange={e => setMetricsForm(f => ({ ...f, shares: e.target.value }))} />
                </div>
              </div>
              <p className="text-xs text-slate-400">Engagement rate is calculated automatically from the values above.</p>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setMetricsModal(null)} className="btn-secondary">Cancel</button>
              <button onClick={handleSaveManualMetrics} disabled={metricsSaving} className="btn-primary flex items-center gap-2">
                {metricsSaving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                Save Metrics
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
