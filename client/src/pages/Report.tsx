import React, { useEffect, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, Trophy, Lightbulb, RefreshCw, Star, Eye } from 'lucide-react';
import { getReportOverview, getReportRanking, getReportTimeline, getReportTakeaways, getProfileBreakdown } from '../lib/api';
import { useAppStore } from '../store';
import { formatNumber, formatCurrency, getPlatformColor, getPlatformIcon, getInitials } from '../lib/utils';
import type { ReportOverview, PerformanceRecord } from '../types';

function ScoreBar({ score, max = 10 }: { score: number; max?: number }) {
  const pct = Math.min((score / max) * 100, 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-slate-600 w-6">{score?.toFixed(1)}</span>
    </div>
  );
}

export default function Report() {
  const { activeCampaign } = useAppStore();
  const [overview, setOverview] = useState<ReportOverview | null>(null);
  const [ranking, setRanking] = useState<PerformanceRecord[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [takeaways, setTakeaways] = useState<string[]>([]);
  const [breakdown, setBreakdown] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (activeCampaign) params.campaign_id = activeCampaign.id;
    const [o, r, t, ta, b] = await Promise.all([
      getReportOverview(params),
      getReportRanking(params),
      getReportTimeline(params),
      getReportTakeaways(params),
      getProfileBreakdown(params),
    ]);
    setOverview(o.data);
    setRanking(r.data);
    setTimeline(t.data);
    setTakeaways(ta.data.takeaways || []);
    setBreakdown(b.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [activeCampaign]);

  const top3ByEngagement = [...ranking].sort((a, b) => (b.engagement_rate || 0) - (a.engagement_rate || 0)).slice(0, 3);
  const top3ByViews = [...ranking].sort((a, b) => (b.views_24h || 0) - (a.views_24h || 0)).slice(0, 3);
  const top3ByCpm = [...ranking].sort((a, b) => (a.cpm || 999) - (b.cpm || 999)).slice(0, 3);

  const MEDAL = ['🥇', '🥈', '🥉'];

  return (
    <div className="p-6 space-y-5">
      {/* Key metrics */}
      {overview && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Total 7d Views', value: formatNumber(overview.total_views_7d), sub: `${formatNumber(overview.total_views_24h)} in 24h` },
            { label: 'Total Likes', value: formatNumber(overview.total_likes), sub: '' },
            { label: 'Avg Engagement', value: `${(overview.avg_engagement || 0).toFixed(1)}%`, sub: 'across all posts' },
            { label: 'CPM', value: formatCurrency(overview.cpm), sub: `${formatNumber(overview.total_registrations)} registrations` },
            { label: 'Total Spend', value: formatCurrency(overview.total_spend), sub: '' },
          ].map(s => (
            <div key={s.label} className="card p-4">
              <div className="text-xl font-bold text-slate-900">{s.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
              {s.sub && <div className="text-xs text-slate-400">{s.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Charts row */}
      {timeline.length > 0 && (
        <div className="card p-5">
          <div className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <TrendingUp size={15} className="text-blue-500" />
            Views Over Time
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d?.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => formatNumber(v)} />
              <Tooltip formatter={(v: any) => formatNumber(v)} />
              <Legend />
              <Line type="monotone" dataKey="views_24h" name="24h Views" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="views_7d" name="7d Views" stroke="#8b5cf6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top 3 pods */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { title: 'Top by Engagement', items: top3ByEngagement, metric: (r: any) => `${(r.engagement_rate || 0).toFixed(1)}%`, label: 'Engagement' },
          { title: 'Top by 24h Views', items: top3ByViews, metric: (r: any) => formatNumber(r.views_24h), label: '24h Views' },
          { title: 'Best CPM', items: top3ByCpm, metric: (r: any) => formatCurrency(r.cpm), label: 'CPM' },
        ].map(({ title, items, metric, label }) => (
          <div key={title} className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Trophy size={14} className="text-yellow-500" />
              <span className="text-sm font-semibold text-slate-700">{title}</span>
            </div>
            <div className="space-y-3">
              {items.map((r, i) => (
                <div key={r.id || i} className="flex items-center gap-2">
                  <span className="text-base">{MEDAL[i]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-800 truncate">{r.name}</span>
                      <span className="text-xs font-semibold text-slate-600 ml-2">{metric(r)}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className={`badge text-[10px] ${getPlatformColor(r.platform)}`}>{r.platform}</span>
                    </div>
                  </div>
                </div>
              ))}
              {items.length === 0 && <div className="text-xs text-slate-400 text-center py-2">No data yet</div>}
            </div>
          </div>
        ))}
      </div>

      {/* Full ranking table */}
      {ranking.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <Star size={14} className="text-yellow-500" />
            <span className="text-sm font-semibold text-slate-700">Full Ranking</span>
          </div>
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="table-header w-10">Rank</th>
                <th className="table-header">Influencer</th>
                <th className="table-header">Platform</th>
                <th className="table-header">24h Views</th>
                <th className="table-header">7d Views</th>
                <th className="table-header">Engagement</th>
                <th className="table-header">CPM</th>
                <th className="table-header">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {ranking.map((r, idx) => (
                <tr key={r.id || idx} className="hover:bg-slate-50">
                  <td className="table-cell text-center">
                    <span className="text-base">{idx < 3 ? MEDAL[idx] : `#${idx + 1}`}</span>
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold">
                        {getInitials(r.name || '')}
                      </div>
                      <div>
                        <div className="font-medium text-sm text-slate-900">{r.name}</div>
                        <div className="text-xs text-slate-400">{r.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="table-cell">
                    <span className={`badge ${getPlatformColor(r.platform)}`}>{getPlatformIcon(r.platform)} {r.platform}</span>
                  </td>
                  <td className="table-cell font-medium">{formatNumber(r.views_24h)}</td>
                  <td className="table-cell font-medium">{formatNumber(r.views_7d)}</td>
                  <td className="table-cell">
                    <span className={`font-medium ${(r.engagement_rate || 0) > 5 ? 'text-green-600' : 'text-slate-600'}`}>
                      {(r.engagement_rate || 0).toFixed(1)}%
                    </span>
                  </td>
                  <td className="table-cell">{formatCurrency(r.cpm)}</td>
                  <td className="table-cell w-36">
                    <ScoreBar score={r.total_score || 0} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* AI Takeaways */}
      {takeaways.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Lightbulb size={15} className="text-yellow-500" />
              <span className="text-sm font-semibold text-slate-700">AI Takeaways</span>
            </div>
            <button onClick={load} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              {loading ? <RefreshCw size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              Refresh
            </button>
          </div>
          <div className="space-y-3">
            {takeaways.map((t, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-xs font-bold flex-shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">{t}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Profile breakdown */}
      {breakdown.length > 0 && (
        <div className="card p-5">
          <div className="text-sm font-semibold text-slate-700 mb-4">Profile Breakdown by Category & Platform</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={breakdown.slice(0, 8)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="category" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => formatNumber(v)} />
                  <Tooltip formatter={(v: any) => formatNumber(v)} />
                  <Bar dataKey="total_views" name="Total Views" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-100">
                  <th className="text-left py-1 pr-3">Category</th>
                  <th className="text-right py-1 pr-3">Avg Engagement</th>
                  <th className="text-right py-1">Total Views</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((b, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td className="py-1.5 pr-3 font-medium text-slate-800">{b.category}</td>
                    <td className="py-1.5 pr-3 text-right">{(b.avg_engagement || 0).toFixed(1)}%</td>
                    <td className="py-1.5 text-right text-slate-500">{formatNumber(b.total_views)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
