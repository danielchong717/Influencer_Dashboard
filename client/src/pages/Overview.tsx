import React, { useEffect, useState, useCallback } from 'react';
import {
  Send, MessageSquareReply, Clapperboard, DollarSign, RefreshCw, Copy, Check,
  ExternalLink, Store, CalendarClock, AlertTriangle, ListChecks, CalendarPlus, ChevronDown,
  Eye, X, Search, CheckCircle2, Circle, RotateCcw, WifiOff,
} from 'lucide-react';
import { getFunnel, markFunnelAction } from '../lib/api';
import { useAppStore } from '../store';

// Each funnel stage owns ONE signature color, reused on metric card + funnel bar + accents.
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

function Chan({ c }: { c: string }) {
  if (!c) return null;
  const map: Record<string, string> = { IG: 'bg-pink-100 text-pink-700', '邮件': 'bg-blue-100 text-blue-700', '小红书': 'bg-red-100 text-red-700' };
  return <span className={`badge text-[10px] px-1.5 py-0 ${map[c] || 'bg-slate-100 text-slate-500'}`}>{c}</span>;
}

// who on our team is handling this (from the Feishu 负责人 field)
function Owner({ name }: { name: string }) {
  if (!name) return null;
  return <span className="badge text-[10px] px-1.5 py-0 bg-slate-100 text-slate-600">👤{name}</span>;
}

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

// the per-row "done" toggle — local only (localStorage), auto-resets when upstream changes
function Done({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} title={on ? '撤销已处理' : '标记已处理'}
      className={`flex-shrink-0 ${on ? 'text-green-500 hover:text-slate-400' : 'text-slate-300 hover:text-green-500'}`}>
      {on ? <CheckCircle2 size={16} /> : <Circle size={16} />}
    </button>
  );
}

function SchedRow({ it, onView, done, onToggle }: any) {
  const tag = it.is_today ? { t: '今天', c: 'bg-red-100 text-red-700' }
    : it.is_tomorrow ? { t: '明天', c: 'bg-amber-100 text-amber-700' } : null;
  const tint = done ? 'opacity-50' : it.is_today ? 'bg-red-50/50' : it.is_tomorrow ? 'bg-amber-50/50' : '';
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 border-t border-slate-100 ${tint}`}>
      <Done on={done} onClick={onToggle} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-medium text-slate-800 truncate ${done ? 'line-through' : ''}`}>{it.name}</span>
          <Chan c={it.channel} /><Owner name={it.owner} />
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

function ActionRow({ it, right, done, onToggle }: any) {
  return (
    <div className={`px-4 py-2 border-t border-slate-100 ${done ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Done on={done} onClick={onToggle} />
        <span className={`font-medium text-slate-800 text-sm truncate ${done ? 'line-through' : ''}`}>{it.name}</span>
        <Chan c={it.channel} /><Owner name={it.owner} />
        <RowLinks it={it} />
        <span className="ml-auto flex items-center gap-2">{right}<Ago iso={it.last_modified} /></span>
      </div>
      {it.note && <div className="text-xs text-slate-400 line-clamp-1 mt-0.5 pl-6">{it.note}</div>}
    </div>
  );
}

function TodoCard({ step, icon, title, sub, count, empty, accent, headerBg, badge, children }: any) {
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
        {empty ? <div className="px-4 py-6 text-center text-xs text-slate-300">清空了 ✓</div> : children}
      </div>
    </div>
  );
}

export default function Overview() {
  const { showToast, activeCampaign } = useAppStore();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showPub, setShowPub] = useState(false);     // 已发布成果 reference view
  const [hideDone, setHideDone] = useState(false);   // optionally declutter handled rows
  const [q, setQ] = useState('');
  const [chan, setChan] = useState('all');            // channel focus: all / IG / 邮件
  const [preview, setPreview] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [, setTick] = useState(0);                    // re-render relative times
  const [override, setOverride] = useState<Record<string, boolean>>({}); // optimistic done state

  const load = useCallback((silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    getFunnel(activeCampaign ? { restaurant: activeCampaign.name } : undefined)
      .then((r) => { setData(r.data); setError(false); setOverride({}); }) // server is truth after refetch
      .catch(() => setError(true))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, [activeCampaign]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {                                   // auto-refresh + live time
    const a = setInterval(() => load(true), 180000);
    const b = setInterval(() => setTick((t) => t + 1), 60000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [load]);

  // done = optimistic override if set, else the server's action_done (written back to Feishu)
  const isHandled = (it: any) => (it.chat_id in override ? override[it.chat_id] : !!it.action_done);
  // mark a step done/undone → writes the Feishu action field for the whole team
  const mark = (it: any, action: string) => {
    const next = !isHandled(it);
    setOverride((o) => ({ ...o, [it.chat_id]: next }));
    markFunnelAction(it.chat_id, action, next).catch(() => {
      setOverride((o) => ({ ...o, [it.chat_id]: !next }));
      showToast('回写飞书失败，已撤销', 'error');
    });
  };
  const matchQ = (it: any) => !q || (it.name || '').toLowerCase().includes(q.toLowerCase()) || (it.handle || '').toLowerCase().includes(q.toLowerCase());
  const matchChan = (it: any) => chan === 'all' || it.channel === chan;
  // handled rows STAY visible (crossed out) and sink to the bottom — never vanish.
  const view = (items: any[]) => {
    const arr = (items || []).filter(matchQ).filter(matchChan);
    const visible = hideDone ? arr.filter((it) => !isHandled(it)) : arr;
    return [...visible].sort((a, b) => Number(isHandled(a)) - Number(isHandled(b)));
  };
  const liveCount = (items: any[]) => (items || []).filter((it) => matchQ(it) && matchChan(it) && !isHandled(it)).length;

  if (loading && !data) {
    return (
      <div className="p-6 space-y-4 animate-pulse">
        <div className="h-7 w-48 bg-slate-200 rounded" />
        <div className="grid grid-cols-2 gap-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-40 bg-slate-100 rounded-2xl" />)}</div>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="p-10 text-center">
        <WifiOff className="mx-auto text-slate-300 mb-3" size={32} />
        <div className="text-slate-500 mb-3">连不上 API server</div>
        <button className="btn-primary" onClick={() => load()}>重试</button>
        <div className="text-xs text-slate-400 mt-3">先在 /server 跑 npm run dev</div>
      </div>
    );
  }
  if (!data) return null;
  if (!data.ready) return <div className="p-8 text-slate-400">漏斗未同步——在 /server 跑 npm run sync:feishu</div>;

  const t = data.todos;
  const sync = syncAge(data.lastSync);
  const sched = view(t.scheduled_msg);
  const schedUrgent = sched.filter((x: any) => x.is_today || x.is_tomorrow);
  const schedRest = sched.filter((x: any) => !x.is_today && !x.is_tomorrow);
  const todoCount = liveCount(t.reply_needed) + liveCount(t.set_time) + liveCount(t.scheduled_msg) + liveCount(t.to_post) + liveCount(t.unpaid);
  const doneCount = [...t.reply_needed, ...(t.set_time || []), ...t.scheduled_msg, ...t.to_post, ...t.unpaid].filter(isHandled).length;
  const onView = (x: any) => { setPreview(x); setCopied(false); };

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
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
            {['all', 'IG', '邮件'].map((c) => (
              <button key={c} onClick={() => setChan(c)}
                className={`px-2.5 py-1.5 ${chan === c ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                {c === 'all' ? '全部' : c}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜博主…"
              className="input pl-7 py-1.5 w-32 text-sm" />
          </div>
          <span className={`text-xs ${sync.cls}`}>同步 {sync.text}{refreshing && ' ·刷新中'}</span>
          <span className="badge bg-slate-100 text-slate-500">只读·飞书</span>
          <button className="btn-secondary flex items-center gap-1 text-xs" onClick={() => setShowStats((v) => !v)}>
            <ChevronDown size={13} className={`transition-transform ${showStats ? '' : '-rotate-90'}`} />数据
          </button>
          <button className="btn-secondary flex items-center gap-1" onClick={() => load(true)}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />刷新
          </button>
        </div>
      </div>

      {/* 数据概览 — passive metrics + funnel, OFF by default */}
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

      {/* THE BOARD: 我的下一步 */}
      <section className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <ListChecks size={18} className="text-slate-700" />
          <h2 className="text-base font-bold text-slate-900">我的下一步</h2>
          <span className="text-xs text-slate-400">回复 → 定时间 → 发邀约 → 催发帖 → 付款 · 点 ✓ 标已处理（划掉留底，不消失）</span>
          {doneCount > 0 && (
            <button onClick={() => setHideDone((v) => !v)} className="ml-auto text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
              <RotateCcw size={12} />{hideDone ? '显示' : '隐藏'}已处理 {doneCount}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <TodoCard step="①" icon={<MessageSquareReply size={16} />} title="待回复" sub="博主发来消息，球在我方 → 去回他" count={liveCount(t.reply_needed)} empty={view(t.reply_needed).length === 0} accent="text-blue-600" headerBg="bg-blue-50" badge="bg-blue-100 text-blue-700">
            {view(t.reply_needed).map((it: any) => <ActionRow key={it.chat_id} it={it} done={isHandled(it)} onToggle={() => mark(it, "reply")} />)}
          </TodoCard>

          <TodoCard step="②" icon={<CalendarPlus size={16} />} title="待定到店时间" sub="已谈成，需我方敲定到店时间" count={liveCount(t.set_time)} empty={view(t.set_time).length === 0} accent="text-sky-600" headerBg="bg-sky-50" badge="bg-sky-100 text-sky-700">
            {view(t.set_time).map((it: any) => <ActionRow key={it.chat_id} it={it} done={isHandled(it)} onToggle={() => mark(it, "settime")} />)}
          </TodoCard>

          <TodoCard step="③" icon={<Send size={16} />} title="发邀约确认" sub="已排期，发确认消息给博主（先看再复制）" count={liveCount(t.scheduled_msg)} empty={sched.length === 0} accent="text-amber-600" headerBg="bg-amber-50" badge="bg-amber-100 text-amber-700">
            {schedUrgent.map((it: any) => <SchedRow key={it.chat_id} it={it} onView={onView} done={isHandled(it)} onToggle={() => mark(it, "invite")} />)}
            {schedUrgent.length > 0 && schedRest.length > 0 && (
              <div className="px-4 py-1 text-[11px] font-medium text-slate-400 bg-slate-50 border-t border-slate-100">其余已排期（待确认）</div>
            )}
            {schedRest.map((it: any) => <SchedRow key={it.chat_id} it={it} onView={onView} done={isHandled(it)} onToggle={() => mark(it, "invite")} />)}
          </TodoCard>

          <TodoCard step="④" icon={<Clapperboard size={16} />} title="催发帖" sub="已到店，还没发帖 → 去催" count={liveCount(t.to_post)} empty={view(t.to_post).length === 0} accent="text-violet-600" headerBg="bg-violet-50" badge="bg-violet-100 text-violet-700">
            {view(t.to_post).map((it: any) => <ActionRow key={it.chat_id} it={it} done={isHandled(it)} onToggle={() => mark(it, "chase")} right={<span className="text-[11px] text-slate-400">到店 {it.visit_date || '?'}</span>} />)}
          </TodoCard>

          <TodoCard step="⑤" icon={<DollarSign size={16} />} title={`付款 · 共 $${data.payments.unpaid_total || 0}`} sub="已发帖，现金报酬待付" count={liveCount(t.unpaid)} empty={view(t.unpaid).length === 0} accent="text-emerald-600" headerBg="bg-emerald-50" badge="bg-emerald-100 text-emerald-700">
            {view(t.unpaid).map((it: any) => <ActionRow key={it.chat_id} it={it} done={isHandled(it)} onToggle={() => mark(it, "pay")} right={<span className="text-red-500 font-medium text-sm">${it.amount}</span>} />)}
          </TodoCard>
        </div>
      </section>

      {/* 已发布成果 (reference) — finished posts with reel/story type + link */}
      <section>
        <button onClick={() => setShowPub((v) => !v)} className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 hover:text-slate-600">
          <ChevronDown size={13} className={`transition-transform ${showPub ? '' : '-rotate-90'}`} />
          已发布成果 {data.published?.length || 0}
        </button>
        {showPub && (
          <div className="card divide-y divide-slate-100">
            {(data.published || []).length === 0 && <div className="px-4 py-4 text-center text-xs text-slate-300">暂无</div>}
            {(data.published || []).map((it: any, i: number) => {
              const pc: Record<string, string> = { reel: 'bg-pink-100 text-pink-700', story: 'bg-amber-100 text-amber-700', post: 'bg-slate-100 text-slate-600' };
              return (
                <div key={i} className="px-4 py-2 flex items-center gap-2 text-sm flex-wrap">
                  <span className="font-medium text-slate-800 truncate">{it.name}</span>
                  <Chan c={it.channel} /><Owner name={it.owner} />
                  {it.post_type && <span className={`badge text-[10px] px-1.5 py-0 ${pc[it.post_type] || 'bg-slate-100 text-slate-600'}`}>{it.post_type}</span>}
                  <span className="text-xs text-slate-400">{it.pub_date || ''}</span>
                  <span className="ml-auto flex items-center gap-2">
                    {it.post_url && <a href={it.post_url} target="_blank" rel="noreferrer" className="text-[11px] text-pink-600 hover:text-pink-800 border border-pink-100 bg-pink-50 rounded px-1.5 py-0.5">帖子↗</a>}
                    {it.feishu_url && <a href={it.feishu_url} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 border border-blue-100 bg-blue-50 rounded px-1.5 py-0.5">飞书↗</a>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* reference: 分店概览 */}
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

      {/* message preview — verify before copying */}
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
