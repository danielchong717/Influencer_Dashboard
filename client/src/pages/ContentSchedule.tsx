import React, { useEffect, useState } from 'react';
import { Link, RefreshCw, Eye, Heart, MessageCircle, Share2, X, Check, ExternalLink } from 'lucide-react';
import { getContent, updateVideoLink, fetchMetrics } from '../lib/api';
import { useAppStore } from '../store';
import { formatNumber, formatDate, formatCurrency, getPlatformColor, getPlatformIcon, getStatusColor } from '../lib/utils';
import type { ContentItem } from '../types';

export default function ContentSchedule() {
  const { activeCampaign, showToast } = useAppStore();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [videoModal, setVideoModal] = useState<ContentItem | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [fetchingId, setFetchingId] = useState<string | null>(null);

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
      await updateVideoLink(videoModal.id, videoUrl);
      showToast('Video link saved. Metrics will auto-populate shortly.', 'success');
      setVideoModal(null);
      setVideoUrl('');
      setTimeout(load, 1500);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchMetrics = async (id: string) => {
    setFetchingId(id);
    try {
      await fetchMetrics(id);
      showToast('Metrics updated', 'success');
      load();
    } finally {
      setFetchingId(null);
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
          <span className="text-xs text-slate-400">Metrics auto-populate after video link is added</span>
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
              <th className="table-header">
                <div className="flex items-center gap-1"><Eye size={12} /> 24h Views</div>
              </th>
              <th className="table-header">
                <div className="flex items-center gap-1"><Eye size={12} /> 7d Views</div>
              </th>
              <th className="table-header">
                <div className="flex items-center gap-1"><Heart size={12} /> Likes</div>
              </th>
              <th className="table-header">Engagement</th>
              <th className="table-header">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {items.map(item => (
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
                  {item.views_24h != null ? (
                    <span className="font-medium text-slate-800">{formatNumber(item.views_24h)}</span>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="table-cell">
                  {item.views_7d != null ? (
                    <span className="font-medium text-slate-800">{formatNumber(item.views_7d)}</span>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="table-cell">
                  {item.likes != null ? (
                    <span className="text-slate-600">{formatNumber(item.likes)}</span>
                  ) : <span className="text-slate-300">—</span>}
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
                      onClick={() => handleFetchMetrics(item.id)}
                      disabled={fetchingId === item.id}
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                    >
                      {fetchingId === item.id ? <RefreshCw size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                      Refresh
                    </button>
                  )}
                </td>
              </tr>
            ))}
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
                <input
                  type="url"
                  className="input"
                  placeholder="https://www.tiktok.com/@username/video/..."
                  value={videoUrl}
                  onChange={e => setVideoUrl(e.target.value)}
                />
                <p className="text-xs text-slate-400 mt-1">Once saved, metrics will be auto-fetched in the background.</p>
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
    </div>
  );
}
