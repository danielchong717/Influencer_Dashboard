import React, { useEffect, useState } from 'react';
import {
  Send, MessageSquareReply, Clapperboard, DollarSign, RefreshCw, Copy, Check,
  ExternalLink, Store, CalendarClock, AlertTriangle, ListChecks, CalendarPlus, ChevronDown, Eye, X,
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

// One scheduled-invite row. Day-of (today) and next-day (tomorrow) get pinned + tinted.
// "查看消息" opens a preview so you verify the message before copying — not a blind copy.
function SchedRow({ it, onView }: { it: any; onView: (it: any) => void }) {
  const tag = it.is_today ? { t: '今天', c: 'bg-red-100 text-red-700' }
    : it.is_tomorrow ? { t: '明天', c: 'bg-amber-100 text-amber-700' } : null;
  const tint = it.is_today ? 'bg-red-50/50' : it.is_tomorrow ? 'bg-amber-50/50' : '';
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 border-t border-slate-100 ${tint}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-slate-800 truncate">{it.name}</span>
          <Chan c={it.channel} />
          {tag && <span className={`badge ${tag.c}`}>{tag.t}</span>}
          <RowLinks it={it} />
        </div>
        <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
          <CalendarClock size={12} /> {it.visit_date} {it.visit_time} · 🍴 {it.restaurant}
        </div>
      </div>
      {it.scheduled_message && (
        <button onClick={() => onView(it)}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 flex-shrink-0">
          <Eye size={12} /> 查看消息
        </button>
      )}
    </div>
  );
}

// A small action row used by 回复/定时间/催发帖/付款 — name + channel + last-touched + links.
function ActionRow({ it, right }: { it: any; right?: React.ReactNode }) {
  return (
    <div className="px-4 py-2 border-t border-slate-100">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium text-slate-800 text-sm truncate">{it.name}</span>
        <Chan c={it.channel} />
        <RowLinks it={it} />
        <span className="ml-auto flex items-center gap-2">{right}<Ago iso={it.last_modified} /></span>
      </div>
      {it.note && <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">{it.note}</div>}
    </div>
  );
}

function TodoCard({ step, icon, title, sub, count, accent, headerBg, badge, children }: any) {
  return (
    <div className="card flex flex-col min-h-0 overflow-hidden">
      <div className={`px-4 py-2.5 border-b border-slate-100 ${headerBg || ''}`}>
        <div className="flex items-center gap-2">
          {step && <span className="text-[11px] font-bold text-slate-400">{step}</span>}
          <span className={accent}>{icon}</span>
          <span className="font-semibold text-slate-800 text-sm">{title}</span>
          <span className={`badge ml-auto ${count > 0 ? (badge || 'bg-slate-200 text-slate-700') : 'bg-slate-50 text-slate-400'}`}>{count}</span>
        </div>
        {sub && <div className="text-[11px] text-slate-500 mt-0.5 pl-1">{sub}</div>}
      </div>
      <div className="overflow-y-auto max-h-72">
        {count === 0 ? <div className="px-4 py-6 text-center text-xs text-slate-300">清空了 ✓</div> : children}
      </div>
    </div>
  );
}

// channel badge — which inbox this conversation lives in (so you know where to go act)
function Chan({ c }: { c: string }) {
  if (!c) return null;
  const map: Record<string, string> = { IG: 'bg-pink-100 text-pink-700', '邮件': 'bg-blue-100 text-blue-700', '小红书': 'bg-red-100 text-red-700' };
  return <span className={`badge text-[10px] px-1.5 py-0 ${map[c] || 'bg-slate-100 text-slate-500'}`}>{c}</span>;
}

// per-row links: open the full row in Feishu (public link) + jump to the IG profile
function RowLinks({ it }: { it: any }) {
  return (
    <span className="flex items-center gap-1.5 flex-shrink-0">
      {it.feishu_url && (
        <a href={it.feishu_url} target="_blank" rel="noreferrer"
           className="text-[11px] text-blue-600 hover:text-blue-800 border border-blue-100 bg-blue-50 rounded px-1.5 py-0.5">飞书↗</a>
      )}
      {it.handle && (
        <a href={`https://instagram.com/${it.handle}`} target="_blank" rel="noreferrer"
           className="text-pink-500 hover:text-pink-700" title={`@${it.handle}`}><ExternalLink size={13} /></a>
      )}
    </span>
  );
}

export default function Overview() {
  const { showToast, activeCampaign } = useAppStore();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showStats, setShowStats] = useState(false); // passive metrics off by default — this is an action board
  const [preview, setPreview] = useState<any>(null);  // the invite whose message is being previewed
  const [copied, setCopied] = useState(false);

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
  const schedUrgent = t.scheduled_msg.filter((x: any) => x.is_today || x.is_tomorrow);
  const schedRest = t.scheduled_msg.filter((x: any) => !x.is_today && !x.is_tomorrow);
  const todoCount = t.reply_needed.length + (t.set_time?.length || 0) + t.scheduled_msg.length + t.to_post.length + t.unpaid.length;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">网红合作进度</h1>
          <p className="text-sm text-slate-500">
            {activeCampaign ? activeCampaign.name : '全部餐厅'} · <span className="font-semibold text-slate-700">{todoCount} 件待办</span> · 共 {data.total} 个对话
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs ${sync.cls}`}>最后同步 {sync.text}</span>
          <span className="badge bg-slate-100 text-slate-500">只读 · 来自飞书</span>
          <button className="btn-secondary flex items-center gap-1" onClick={() => setShowStats((v) => !v)}>
            <ChevronDown size={14} className={`transition-transform ${showStats ? '' : '-rotate-90'}`} />数据概览
          </button>
          <button className="btn-secondary flex items-center gap-1" onClick={load}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />刷新
          </button>
        </div>
      </div>

      {/* ───────── 数据概览 — passive metrics + funnel, OFF by default (not actionable) ───────── */}
      {showStats && (
      <section>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">数据概览（参考，非待办）</div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <div className="bg-slate-900 text-white rounded-lg px-3 py-2">
            <div className="text-[11px] text-slate-300">活跃对话</div>
            <div className="text-xl font-bold leading-tight">{data.total}</div>
          </div>
          {data.order.map((b: string) => (
            <div key={b} className={`rounded-lg border px-3 py-2 ${METRIC_META[b]?.bg}`}>
              <div className="text-[11px] text-slate-500">{METRIC_META[b]?.label}</div>
              <div className={`text-xl font-bold leading-tight ${METRIC_META[b]?.color}`}>{data.metrics[b] || 0}</div>
            </div>
          ))}
        </div>

        {/* cumulative funnel — narrows monotonically (unlike the snapshot metrics above) */}
        {data.funnelBar && (
          <div className="card mt-2 px-4 py-2.5 flex items-center gap-2">
            {data.funnelBar.map((s: any, i: number) => {
              const max = data.funnelBar[0].count || 1;
              const pct = Math.max(8, Math.round((s.count / max) * 100));
              return (
                <React.Fragment key={s.key}>
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-[11px] text-slate-500">{s.label}</span>
                      <span className="text-xs font-bold text-slate-800">{s.count}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${METRIC_META[s.key]?.bar || 'bg-slate-700'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  {i < data.funnelBar.length - 1 && <span className="text-slate-300 text-xs">▸</span>}
                </React.Fragment>
              );
            })}
            <div className="pl-3 ml-1 border-l border-slate-100 text-center">
              <div className="text-[11px] text-slate-500">转化率</div>
              <div className="text-base font-bold text-green-600">
                {data.funnelBar[0].count ? Math.round((data.funnelBar[data.funnelBar.length - 1].count / data.funnelBar[0].count) * 100) : 0}%
              </div>
            </div>
          </div>
        )}
      </section>
      )}

      {/* ───────── THE BOARD: 我的下一步 — flow-ordered action queues (the whole point) ───────── */}
      <section className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <ListChecks size={18} className="text-slate-700" />
          <h2 className="text-base font-bold text-slate-900">我的下一步</h2>
          <span className="text-xs text-slate-400">按对接流程：回复 → 定时间 → 发邀约 → 催发帖 → 付款 · 每行可开飞书/IG</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* ① reply: they messaged us, ball in our court */}
          <TodoCard step="①" icon={<MessageSquareReply size={16} />} title="待回复" sub="博主发来消息，球在我方 → 去回他" count={t.reply_needed.length} accent="text-blue-600" headerBg="bg-blue-50" badge="bg-blue-100 text-blue-700">
            {t.reply_needed.map((it: any, i: number) => <ActionRow key={i} it={it} />)}
          </TodoCard>

          {/* ② set time: agreed, but no visit time yet */}
          <TodoCard step="②" icon={<CalendarPlus size={16} />} title="待定到店时间" sub="已谈成，需我方敲定到店时间" count={t.set_time?.length || 0} accent="text-sky-600" headerBg="bg-sky-50" badge="bg-sky-100 text-sky-700">
            {(t.set_time || []).map((it: any, i: number) => <ActionRow key={i} it={it} />)}
          </TodoCard>

          {/* ③ send invite confirmation: time is set, send/confirm message (today/tomorrow pinned) */}
          <TodoCard step="③" icon={<Send size={16} />} title="发邀约确认" sub="已排期，发确认消息给博主（先看再复制）" count={t.scheduled_msg.length} accent="text-amber-600" headerBg="bg-amber-50" badge="bg-amber-100 text-amber-700">
            {schedUrgent.map((it: any, i: number) => <SchedRow key={`u${i}`} it={it} onView={(x) => { setPreview(x); setCopied(false); }} />)}
            {schedUrgent.length > 0 && schedRest.length > 0 && (
              <div className="px-4 py-1 text-[11px] font-medium text-slate-400 bg-slate-50 border-t border-slate-100">其余已排期（待确认）</div>
            )}
            {schedRest.map((it: any, i: number) => <SchedRow key={`r${i}`} it={it} onView={(x) => { setPreview(x); setCopied(false); }} />)}
          </TodoCard>

          {/* ④ chase post: visited, hasn't posted */}
          <TodoCard step="④" icon={<Clapperboard size={16} />} title="催发帖" sub="已到店，还没发帖 → 去催" count={t.to_post.length} accent="text-violet-600" headerBg="bg-violet-50" badge="bg-violet-100 text-violet-700">
            {t.to_post.map((it: any, i: number) => (
              <ActionRow key={i} it={it} right={<span className="text-[11px] text-slate-400">到店 {it.visit_date || '?'}</span>} />
            ))}
          </TodoCard>

          {/* ⑤ pay */}
          <TodoCard step="⑤" icon={<DollarSign size={16} />} title={`付款 · 共 $${data.payments.unpaid_total || 0}`} sub="已发帖，现金报酬待付" count={t.unpaid.length} accent="text-emerald-600" headerBg="bg-emerald-50" badge="bg-emerald-100 text-emerald-700">
            {t.unpaid.map((it: any, i: number) => (
              <ActionRow key={i} it={it} right={<span className="text-red-500 font-medium text-sm">${it.amount}</span>} />
            ))}
          </TodoCard>
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

      {/* message preview — verify the invite before copying (not a blind copy) */}
      {preview && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <div>
                <div className="font-semibold text-slate-900">{preview.name} 的邀约消息</div>
                <div className="text-xs text-slate-500">{preview.visit_date} {preview.visit_time} · {preview.restaurant} · 确认无误再复制</div>
              </div>
              <button onClick={() => setPreview(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <pre className="px-5 py-4 text-sm text-slate-700 whitespace-pre-wrap break-words max-h-[50vh] overflow-y-auto font-sans">{preview.scheduled_message}</pre>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100">
              {preview.feishu_url && (
                <a href={preview.feishu_url} target="_blank" rel="noreferrer" className="btn-secondary">飞书打开此行 ↗</a>
              )}
              <button
                onClick={() => { navigator.clipboard.writeText(preview.scheduled_message || ''); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="btn-primary flex items-center gap-1.5">
                {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? '已复制' : '复制消息'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
