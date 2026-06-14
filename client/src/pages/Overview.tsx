import React, { useEffect, useState } from 'react';
import {
  Send, MessageSquareReply, Clapperboard, DollarSign, RefreshCw, Copy, Check,
  ExternalLink, Store, CalendarClock, AlertTriangle, Sun,
} from 'lucide-react';
import { getFunnel } from '../lib/api';
import { useAppStore } from '../store';

// Each funnel stage owns ONE signature color, reused on the metric card, the funnel bar,
// and that stage's accents — colorful but coherent (color = which stage, consistently).
const METRIC_META: Record<string, { label: string; color: string; bg: string; bar: string }> = {
  no_reply:  { label: '等对方回', color: 'text-slate-700',  bg: 'bg-slate-50 border-slate-200',   bar: 'bg-slate-400' },
  talking:   { label: '沟通中',   color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',     bar: 'bg-blue-500' },
  scheduled: { label: '已约时间', color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',   bar: 'bg-amber-500' },
  visited:   { label: '已到店',   color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200', bar: 'bg-violet-500' },
  published: { label: '已发布',   color: 'text-green-700',  bg: 'bg-green-50 border-green-200',    bar: 'bg-green-500' },
};

function syncAge(iso: string | null): { text: string; cls: string } {
  if (!iso) return { text: '未同步', cls: 'text-slate-400' };
  const mins = Math.round((Date.now() - new Date(iso.replace(' ', 'T')).getTime()) / 60000);
  const text = mins < 1 ? '刚刚' : mins < 60 ? `${mins} 分钟前` : `${Math.round(mins / 60)} 小时前`;
  const cls = mins > 180 ? 'text-red-500' : mins > 90 ? 'text-amber-600' : 'text-slate-500';
  return { text, cls };
}

// compact "how long since this row last changed" — tiny, but colored by staleness so a
// to-do that's been sitting for days turns amber→red and pops out on its own.
function ago(iso: string | null): { text: string; cls: string } {
  if (!iso) return { text: '', cls: '' };
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  const hrs = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  const text = days >= 1 ? `${days}天前` : hrs >= 1 ? `${hrs}小时前` : '今天';
  const cls = days >= 7 ? 'text-red-500 font-medium' : days >= 3 ? 'text-amber-600' : 'text-slate-400';
  return { text, cls };
}
const Ago = ({ iso }: { iso: string | null }) => {
  if (!iso) return null;
  const a = ago(iso);
  return <span className={`text-[11px] flex-shrink-0 ${a.cls}`}>{a.text}</span>;
};

function CopyMsg({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  if (!text) return null;
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}
      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-600 flex-shrink-0"
      title="复制 Scheduled Message"
    >
      {done ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
      {done ? '已复制' : '复制消息'}
    </button>
  );
}

function IgLink({ handle }: { handle: string }) {
  if (!handle) return null;
  return (
    <a href={`https://instagram.com/${handle}`} target="_blank" rel="noreferrer"
       className="text-pink-500 hover:text-pink-700 flex-shrink-0" title={`@${handle}`}>
      <ExternalLink size={13} />
    </a>
  );
}

function TodoCard({ icon, title, count, accent, headerBg, badge, children, small }: any) {
  return (
    <div className="card flex flex-col min-h-0 overflow-hidden">
      <div className={`flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 ${headerBg || ''}`}>
        <span className={accent}>{icon}</span>
        <span className="font-semibold text-slate-800 text-sm">{title}</span>
        <span className={`badge ml-auto ${count > 0 ? (badge || 'bg-slate-200 text-slate-700') : 'bg-slate-50 text-slate-400'}`}>{count}</span>
      </div>
      <div className={`overflow-y-auto ${small ? 'max-h-56' : 'max-h-72'}`}>
        {count === 0 ? <div className="px-4 py-6 text-center text-xs text-slate-300">清空了 ✓</div> : children}
      </div>
    </div>
  );
}

export default function Overview() {
  const { showToast, activeCampaign } = useAppStore();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    getFunnel(activeCampaign ? { restaurant: activeCampaign.name } : undefined)
      .then((r) => setData(r.data))
      .catch(() => showToast('连不上 API server（先在 /server 跑 npm run dev）', 'info'))
      .finally(() => setLoading(false));
  };
  useEffect(load, [activeCampaign]);

  if (loading && !data) return <div className="p-8 text-slate-400">加载中…</div>;
  if (!data) return <div className="p-8 text-slate-400">暂无数据</div>;
  if (!data.ready) return <div className="p-8 text-slate-400">漏斗未同步——在 /server 跑 npm run sync:feishu</div>;

  const t = data.todos;
  const sync = syncAge(data.lastSync);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">网红合作进度</h1>
          <p className="text-sm text-slate-500">
            数据来自飞书 · {activeCampaign ? activeCampaign.name : '全部餐厅'} · 共 {data.total} 个对话
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs ${sync.cls}`}>最后同步 {sync.text}</span>
          <span className="badge bg-slate-100 text-slate-500">只读 · 来自飞书</span>
          <button className="btn-secondary flex items-center gap-1" onClick={load}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />刷新
          </button>
        </div>
      </div>

      {/* ───────── ZONE 1: 现状一览 (passive numbers to know) ───────── */}
      <section>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">现状一览</div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <div className="bg-slate-900 text-white rounded-xl p-3">
            <div className="text-xs text-slate-300">活跃对话</div>
            <div className="text-2xl font-bold">{data.total}</div>
          </div>
          {data.order.map((b: string) => (
            <div key={b} className={`rounded-xl border p-3 ${METRIC_META[b]?.bg}`}>
              <div className="text-xs text-slate-500">{METRIC_META[b]?.label}</div>
              <div className={`text-2xl font-bold ${METRIC_META[b]?.color}`}>{data.metrics[b] || 0}</div>
            </div>
          ))}
        </div>

        {/* cumulative funnel — narrows monotonically (unlike the snapshot metrics above) */}
        {data.funnelBar && (
          <div className="card mt-3 p-4">
            <div className="flex items-end gap-2">
              {data.funnelBar.map((s: any, i: number) => {
                const max = data.funnelBar[0].count || 1;
                const pct = Math.max(8, Math.round((s.count / max) * 100));
                return (
                  <React.Fragment key={s.key}>
                    <div className="flex-1 text-center">
                      <div className="text-xs text-slate-500 mb-1">{s.label}</div>
                      <div className="h-7 bg-slate-100 rounded-md overflow-hidden flex items-center">
                        <div className={`h-full rounded-md ${METRIC_META[s.key]?.bar || 'bg-slate-700'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-sm font-bold text-slate-800 mt-1">{s.count}</div>
                    </div>
                    {i < data.funnelBar.length - 1 && <span className="text-slate-300 pb-7">▸</span>}
                  </React.Fragment>
                );
              })}
              <div className="pl-3 border-l border-slate-100 text-center self-center">
                <div className="text-xs text-slate-500">转化率</div>
                <div className="text-lg font-bold text-green-600">
                  {data.funnelBar[0].count ? Math.round((data.funnelBar[data.funnelBar.length - 1].count / data.funnelBar[0].count) * 100) : 0}%
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ───────── ZONE 2: 今天要做的事 (tinted = the team's job) ───────── */}
      <section className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sun size={16} className="text-amber-500" />
          <h2 className="text-sm font-bold text-slate-900">今天要做的事</h2>
        </div>

        <div className="space-y-4">
          {/* the morning job: scheduled messages to send */}
          <TodoCard icon={<Send size={16} />} title="今天要发的邀约" count={t.scheduled_msg.length} accent="text-amber-600" headerBg="bg-amber-50" badge="bg-amber-100 text-amber-700">
            {t.scheduled_msg.map((it: any, i: number) => (
              <div key={i} className={`flex items-center gap-3 px-4 py-2.5 border-t border-slate-100 ${it.is_today ? 'bg-amber-50/60' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800 truncate">{it.name}</span>
                    <IgLink handle={it.handle} />
                    {it.is_today && <span className="badge bg-amber-100 text-amber-700">今天</span>}
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                    <CalendarClock size={12} /> {it.visit_date} {it.visit_time} · 🍴 {it.restaurant}
                  </div>
                </div>
                <CopyMsg text={it.scheduled_message} />
              </div>
            ))}
          </TodoCard>

          {/* three action queues */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TodoCard icon={<MessageSquareReply size={16} />} title="该我们回" count={t.reply_needed.length} accent="text-blue-600" headerBg="bg-blue-50" badge="bg-blue-100 text-blue-700">
              {t.reply_needed.map((it: any, i: number) => (
                <div key={i} className="px-4 py-2 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800 text-sm truncate">{it.name}</span>
                    <IgLink handle={it.handle} />
                    <span className="ml-auto"><Ago iso={it.last_modified} /></span>
                  </div>
                  {it.note && <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">{it.note}</div>}
                </div>
              ))}
            </TodoCard>

            <TodoCard icon={<Clapperboard size={16} />} title="该催发帖" count={t.to_post.length} accent="text-violet-600" headerBg="bg-violet-50" badge="bg-violet-100 text-violet-700">
              {t.to_post.map((it: any, i: number) => (
                <div key={i} className="px-4 py-2 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800 text-sm truncate">{it.name}</span>
                    <IgLink handle={it.handle} />
                    <span className="ml-auto"><Ago iso={it.last_modified} /></span>
                  </div>
                </div>
              ))}
            </TodoCard>

            <TodoCard icon={<DollarSign size={16} />} title="待付款" count={t.unpaid.length} accent="text-emerald-600" headerBg="bg-emerald-50" badge="bg-emerald-100 text-emerald-700" small>
              {t.unpaid.map((it: any, i: number) => (
                <div key={i} className="flex items-center gap-2 px-4 py-2 border-t border-slate-100 text-sm">
                  <span className="text-slate-700 truncate">{it.name}</span>
                  <Ago iso={it.last_modified} />
                  <span className="text-red-500 font-medium flex-shrink-0 ml-auto">${it.amount}</span>
                </div>
              ))}
            </TodoCard>
          </div>
        </div>
      </section>

      {/* ───────── reference: 分店概览 ───────── */}
      <section>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">分店概览</div>
        <div className="card p-2">
          {data.byRestaurant.map((r: any, i: number) => (
            <div key={i} className="px-3 py-2 text-sm flex items-center justify-between border-b border-slate-50 last:border-0">
              <span className="text-slate-700 flex items-center gap-2"><Store size={13} className="text-slate-400" />{r.restaurant}</span>
              <span className="text-xs text-slate-400">{r.total} 个 · 发{r.published} 约{r.scheduled}</span>
            </div>
          ))}
          {data.unassigned > 0 && (
            <div className="px-3 py-2 mt-1 text-xs text-amber-700 bg-amber-50 rounded-lg flex items-center gap-2">
              <AlertTriangle size={13} className="flex-shrink-0" />
              {data.unassigned} 个对话未分配餐厅 · 飞书侧待补（按餐厅筛选时不计入）
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
