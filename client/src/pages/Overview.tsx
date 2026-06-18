import React, { useEffect, useState, useCallback } from 'react';
import {
  Send, MessageSquareReply, Clapperboard, DollarSign, RefreshCw, Copy, Check,
  ExternalLink, Store, CalendarClock, AlertTriangle, ListChecks, CalendarPlus, ChevronDown,
  Eye, X, Search, CheckCircle2, Circle, RotateCcw, WifiOff,
} from 'lucide-react';
import { getFunnel, markFunnelAction } from '../lib/api';
import { useAppStore } from '../store';

const METRIC_META: Record<string, { label: string; color: string; bg: string; bar: string }> = {
  no_reply:  { label: 'Awaiting Reply', color: 'text-slate-700',  bg: 'bg-slate-50 border-slate-200',   bar: 'bg-slate-400' },
  talking:   { label: 'In Discussion',  color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',     bar: 'bg-blue-500' },
  scheduled: { label: 'Time Scheduled', color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',   bar: 'bg-amber-500' },
  visited:   { label: 'Visited',        color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200', bar: 'bg-violet-500' },
  published: { label: 'Published',      color: 'text-green-700',  bg: 'bg-green-50 border-green-200',   bar: 'bg-green-500' },
};

const CHAN_LABELS: Record<string, string> = { all: 'All', IG: 'IG', '邮件': 'Email' };

function syncAge(iso: string | null): { text: string; cls: string } {
  if (!iso) return { text: 'Not synced', cls: 'text-slate-400' };
  const mins = Math.round((Date.now() - new Date(iso.replace(' ', 'T')).getTime()) / 60000);
  const text = mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} hr ago`;
  const cls = mins > 180 ? 'text-red-500' : mins > 90 ? 'text-amber-600' : 'text-slate-500';
  return { text, cls };
}

function ago(iso: string | null): { text: string; cls: string } {
  if (!iso) return { text: '', cls: '' };
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  const hrs = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  const text = days >= 1 ? `${days}d ago` : hrs >= 1 ? `${hrs}hr ago` : 'today';
  const cls = days >= 7 ? 'text-red-500 font-medium' : days >= 3 ? 'text-amber-600' : 'text-slate-400';
  return { text, cls };
}
const Ago = ({ iso }: { iso: string | null }) => {
  if (!iso) return null;
  const a = ago(iso);
  return <span className={`text-[11px] flex-shrink-0 ${a.cls}`}>{a.text}</span>;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function dayLabel(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()} ${WEEKDAYS[d.getDay()]}`;
}

function Chan({ c }: { c: string }) {
  if (!c) return null;
  const map: Record<string, string> = { IG: 'bg-pink-100 text-pink-700', '邮件': 'bg-blue-100 text-blue-700', '小红书': 'bg-red-100 text-red-700' };
  const label: Record<string, string> = { '邮件': 'Email', '小红书': 'RedNote' };
  return <span className={`badge text-[10px] px-1.5 py-0 ${map[c] || 'bg-slate-100 text-slate-500'}`}>{label[c] || c}</span>;
}

function Owner({ name }: { name: string }) {
  if (!name) return null;
  return <span className="badge text-[10px] px-1.5 py-0 bg-slate-100 text-slate-600">👤{name}</span>;
}

function RowLinks({ it }: { it: any }) {
  return (
    <span className="flex items-center gap-1.5 flex-shrink-0">
      {it.feishu_url && (
        <a href={it.feishu_url} target="_blank" rel="noreferrer"
           className="text-[11px] text-blue-600 hover:text-blue-800 border border-blue-100 bg-blue-50 rounded px-1.5 py-0.5">Feishu ↗</a>
      )}
      {it.handle && (
        <a href={`https://instagram.com/${it.handle}`} target="_blank" rel="noreferrer"
           className="text-pink-500 hover:text-pink-700" title={`@${it.handle}`}><ExternalLink size={13} /></a>
      )}
    </span>
  );
}

function Done({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} title={on ? 'Undo handled' : 'Mark handled'}
      className={`flex-shrink-0 ${on ? 'text-green-500 hover:text-slate-400' : 'text-slate-300 hover:text-green-500'}`}>
      {on ? <CheckCircle2 size={16} /> : <Circle size={16} />}
    </button>
  );
}

function SchedRow({ it, onView, done, onToggle }: any) {
  const tag = it.is_today ? { t: 'Today', c: 'bg-red-100 text-red-700' }
    : it.is_tomorrow ? { t: 'Tomorrow', c: 'bg-amber-100 text-amber-700' } : null;
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
          <Eye size={12} /> Preview
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
        {empty ? <div className="px-4 py-6 text-center text-xs text-slate-300">All clear ✓</div> : children}
      </div>
    </div>
  );
}

function ArrivalRow({ it, big, showDay }: { it: any; big?: boolean; showDay?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t border-white/40 first:border-t-0">
      <span className={`font-mono font-bold flex-shrink-0 tabular-nums ${big ? 'text-base' : 'text-sm'} ${it.visit_time ? 'text-slate-900' : 'text-slate-400 text-xs'}`}>
        {showDay ? <span className="text-[11px] text-slate-500 font-sans font-medium mr-1">{dayLabel(it.visit_date)}</span> : null}
        {it.visit_time || 'TBD'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`font-semibold text-slate-800 truncate ${big ? '' : 'text-sm'}`}>{it.name}</span>
          <Chan c={it.channel} />
        </div>
        <div className="text-xs text-slate-500 truncate">🍴 {it.restaurant || 'Unassigned'}{it.owner ? ` · ${it.owner}` : ''}</div>
      </div>
      <RowLinks it={it} />
    </div>
  );
}

function ArrivalDay({ title, items, accent, big, showDay }: any) {
  return (
    <div className={`rounded-xl border ${accent.border} ${accent.bg} flex flex-col overflow-hidden`}>
      <div className={`px-3 py-2 flex items-center gap-2 ${accent.head}`}>
        <span className={`font-bold text-sm ${accent.text}`}>{title}</span>
        <span className={`badge ml-auto ${items.length > 0 ? accent.badge : 'bg-white/60 text-slate-400'}`}>{items.length}</span>
      </div>
      <div className="bg-white/50 max-h-64 overflow-y-auto">
        {items.length === 0
          ? <div className="px-3 py-4 text-center text-xs text-slate-400">None arriving</div>
          : items.map((it: any) => <ArrivalRow key={it.chat_id} it={it} big={big} showDay={showDay} />)}
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
  const [showPub, setShowPub] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const [q, setQ] = useState('');
  const [chan, setChan] = useState('all');
  const [preview, setPreview] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [, setTick] = useState(0);
  const [override, setOverride] = useState<Record<string, boolean>>({});

  const load = useCallback((silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    getFunnel(activeCampaign ? { restaurant: activeCampaign.name } : undefined)
      .then((r) => { setData(r.data); setError(false); setOverride({}); })
      .catch(() => setError(true))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, [activeCampaign]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const a = setInterval(() => load(true), 180000);
    const b = setInterval(() => setTick((t) => t + 1), 60000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [load]);

  const isHandled = (it: any) => (it.chat_id in override ? override[it.chat_id] : !!it.action_done);
  const mark = (it: any, action: string) => {
    const next = !isHandled(it);
    setOverride((o) => ({ ...o, [it.chat_id]: next }));
    markFunnelAction(it.chat_id, action, next).catch(() => {
      setOverride((o) => ({ ...o, [it.chat_id]: !next }));
      showToast('Feishu sync failed, reverted', 'error');
    });
  };
  const matchQ = (it: any) => !q || (it.name || '').toLowerCase().includes(q.toLowerCase()) || (it.handle || '').toLowerCase().includes(q.toLowerCase());
  const matchChan = (it: any) => chan === 'all' || it.channel === chan;
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
        <div className="text-slate-500 mb-3">Cannot reach API server</div>
        <button className="btn-primary" onClick={() => load()}>Retry</button>
        <div className="text-xs text-slate-400 mt-3">Run npm run dev in /server first</div>
      </div>
    );
  }
  if (!data) return null;
  if (!data.ready) return <div className="p-8 text-slate-400">Funnel not synced — run npm run sync:feishu in /server</div>;

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
          <h1 className="text-xl font-bold text-slate-900">Influencer Progress</h1>
          <p className="text-sm text-slate-500">
            {activeCampaign ? activeCampaign.name : 'All Locations'} · <span className="font-semibold text-slate-700">{todoCount} to-do</span> · {data.total} conversations
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
            {['all', 'IG', '邮件'].map((c) => (
              <button key={c} onClick={() => setChan(c)}
                className={`px-2.5 py-1.5 ${chan === c ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                {CHAN_LABELS[c] || c}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search influencer..."
              className="input pl-7 py-1.5 w-36 text-sm" />
          </div>
          <span className={`text-xs ${sync.cls}`}>Synced {sync.text}{refreshing && ' · refreshing'}</span>
          <span className="badge bg-slate-100 text-slate-500">Read-only · Feishu</span>
          <button className="btn-secondary flex items-center gap-1 text-xs" onClick={() => setShowStats((v) => !v)}>
            <ChevronDown size={13} className={`transition-transform ${showStats ? '' : '-rotate-90'}`} />Stats
          </button>
          <button className="btn-secondary flex items-center gap-1" onClick={() => load(true)}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />Refresh
          </button>
        </div>
      </div>

      {/* This Week's Visits */}
      {(() => {
        const a = data.arrivals || { today: [], tomorrow: [], later: [] };
        const totalWeek = a.today.length + a.tomorrow.length + a.later.length;
        return (
          <section>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <CalendarClock size={18} className="text-rose-600" />
              <h2 className="text-base font-bold text-slate-900">This Week's Visits</h2>
              <span className="text-xs text-slate-400">Who's arriving · when · where — check this first each day</span>
              <span className="badge ml-auto bg-rose-100 text-rose-700">{totalWeek}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
              <ArrivalDay title="Today" items={a.today} big showDay={false}
                accent={{ border: 'border-rose-200', bg: 'bg-rose-50', head: 'bg-rose-100/60', text: 'text-rose-700', badge: 'bg-rose-200 text-rose-800' }} />
              <ArrivalDay title="Tomorrow" items={a.tomorrow} showDay={false}
                accent={{ border: 'border-amber-200', bg: 'bg-amber-50', head: 'bg-amber-100/60', text: 'text-amber-700', badge: 'bg-amber-200 text-amber-800' }} />
              <ArrivalDay title="Rest of Week" items={a.later} showDay
                accent={{ border: 'border-slate-200', bg: 'bg-slate-50', head: 'bg-slate-100/60', text: 'text-slate-600', badge: 'bg-slate-200 text-slate-700' }} />
            </div>
          </section>
        );
      })()}

      {/* Stats — off by default */}
      {showStats && (
        <section>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Stats Overview (reference, not action items)</div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <div className="bg-slate-900 text-white rounded-lg px-3 py-2">
              <div className="text-[11px] text-slate-300">Active Conversations</div>
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
                        <span className="text-[11px] text-slate-500">{METRIC_META[s.key]?.label || s.label}</span>
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
                <div className="text-[11px] text-slate-500">Conversion</div>
                <div className="text-base font-bold text-green-600">
                  {data.funnelBar[0].count ? Math.round((data.funnelBar[data.funnelBar.length - 1].count / data.funnelBar[0].count) * 100) : 0}%
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Next Actions board */}
      <section className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <ListChecks size={18} className="text-slate-700" />
          <h2 className="text-base font-bold text-slate-900">Next Actions</h2>
          <span className="text-xs text-slate-400">Reply → Set time → Send invite → Chase post → Pay · Check ✓ to mark handled (strikethrough stays)</span>
          {doneCount > 0 && (
            <button onClick={() => setHideDone((v) => !v)} className="ml-auto text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
              <RotateCcw size={12} />{hideDone ? 'Show' : 'Hide'} handled {doneCount}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <TodoCard step="①" icon={<MessageSquareReply size={16} />} title="Needs Reply" sub="Influencer messaged — your turn to reply" count={liveCount(t.reply_needed)} empty={view(t.reply_needed).length === 0} accent="text-blue-600" headerBg="bg-blue-50" badge="bg-blue-100 text-blue-700">
            {view(t.reply_needed).map((it: any) => <ActionRow key={it.chat_id} it={it} done={isHandled(it)} onToggle={() => mark(it, 'reply')} />)}
          </TodoCard>

          <TodoCard step="②" icon={<CalendarPlus size={16} />} title="Set Visit Time" sub="Deal agreed — nail down their visit time" count={liveCount(t.set_time)} empty={view(t.set_time).length === 0} accent="text-sky-600" headerBg="bg-sky-50" badge="bg-sky-100 text-sky-700">
            {view(t.set_time).map((it: any) => <ActionRow key={it.chat_id} it={it} done={isHandled(it)} onToggle={() => mark(it, 'settime')} />)}
          </TodoCard>

          <TodoCard step="③" icon={<Send size={16} />} title="Send Invite" sub="Scheduled — send confirmation message (preview then copy)" count={liveCount(t.scheduled_msg)} empty={sched.length === 0} accent="text-amber-600" headerBg="bg-amber-50" badge="bg-amber-100 text-amber-700">
            {schedUrgent.map((it: any) => <SchedRow key={it.chat_id} it={it} onView={onView} done={isHandled(it)} onToggle={() => mark(it, 'invite')} />)}
            {schedUrgent.length > 0 && schedRest.length > 0 && (
              <div className="px-4 py-1 text-[11px] font-medium text-slate-400 bg-slate-50 border-t border-slate-100">Other scheduled (pending confirmation)</div>
            )}
            {schedRest.map((it: any) => <SchedRow key={it.chat_id} it={it} onView={onView} done={isHandled(it)} onToggle={() => mark(it, 'invite')} />)}
          </TodoCard>

          <TodoCard step="④" icon={<Clapperboard size={16} />} title="Chase Post" sub="Visited, no post yet — follow up" count={liveCount(t.to_post)} empty={view(t.to_post).length === 0} accent="text-violet-600" headerBg="bg-violet-50" badge="bg-violet-100 text-violet-700">
            {view(t.to_post).map((it: any) => <ActionRow key={it.chat_id} it={it} done={isHandled(it)} onToggle={() => mark(it, 'chase')} right={<span className="text-[11px] text-slate-400">Visited {it.visit_date || '?'}</span>} />)}
          </TodoCard>

          <TodoCard step="⑤" icon={<DollarSign size={16} />} title={`Pay · Total $${data.payments.unpaid_total || 0}`} sub="Posted — cash payment pending" count={liveCount(t.unpaid)} empty={view(t.unpaid).length === 0} accent="text-emerald-600" headerBg="bg-emerald-50" badge="bg-emerald-100 text-emerald-700">
            {view(t.unpaid).map((it: any) => <ActionRow key={it.chat_id} it={it} done={isHandled(it)} onToggle={() => mark(it, 'pay')} right={<span className="text-red-500 font-medium text-sm">${it.amount}</span>} />)}
          </TodoCard>
        </div>
      </section>

      {/* Published results */}
      <section>
        <button onClick={() => setShowPub((v) => !v)} className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 hover:text-slate-600">
          <ChevronDown size={13} className={`transition-transform ${showPub ? '' : '-rotate-90'}`} />
          Published Results {data.published?.length || 0}
        </button>
        {showPub && (
          <div className="card divide-y divide-slate-100">
            {(data.published || []).length === 0 && <div className="px-4 py-4 text-center text-xs text-slate-300">None yet</div>}
            {(data.published || []).map((it: any, i: number) => {
              const pc: Record<string, string> = { reel: 'bg-pink-100 text-pink-700', story: 'bg-amber-100 text-amber-700', post: 'bg-slate-100 text-slate-600' };
              return (
                <div key={i} className="px-4 py-2 flex items-center gap-2 text-sm flex-wrap">
                  <span className="font-medium text-slate-800 truncate">{it.name}</span>
                  <Chan c={it.channel} /><Owner name={it.owner} />
                  {it.post_type && <span className={`badge text-[10px] px-1.5 py-0 ${pc[it.post_type] || 'bg-slate-100 text-slate-600'}`}>{it.post_type}</span>}
                  <span className="text-xs text-slate-400">{it.pub_date || ''}</span>
                  <span className="ml-auto flex items-center gap-2">
                    {it.post_url && <a href={it.post_url} target="_blank" rel="noreferrer" className="text-[11px] text-pink-600 hover:text-pink-800 border border-pink-100 bg-pink-50 rounded px-1.5 py-0.5">Post ↗</a>}
                    {it.feishu_url && <a href={it.feishu_url} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 border border-blue-100 bg-blue-50 rounded px-1.5 py-0.5">Feishu ↗</a>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Location Breakdown */}
      <section>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Location Breakdown</div>
        <div className="card p-2">
          {data.byRestaurant.map((r: any, i: number) => (
            <div key={i} className="px-3 py-2 text-sm flex items-center justify-between border-b border-slate-50 last:border-0">
              <span className="text-slate-700 flex items-center gap-2"><Store size={13} className="text-slate-400" />{r.restaurant}</span>
              <span className="text-xs text-slate-400">{r.total} total · {r.published} published · {r.scheduled} scheduled</span>
            </div>
          ))}
          {data.unassigned > 0 && (
            <div className="px-3 py-2 mt-1 text-xs text-amber-700 bg-amber-50 rounded-lg flex items-center gap-2">
              <AlertTriangle size={13} className="flex-shrink-0" />
              {data.unassigned} conversations not assigned to a location · update in Feishu (excluded from location filter)
            </div>
          )}
        </div>
      </section>

      {/* Message preview modal */}
      {preview && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <div>
                <div className="font-semibold text-slate-900">{preview.name} — Invite Message</div>
                <div className="text-xs text-slate-500">{preview.visit_date} {preview.visit_time} · {preview.restaurant} · verify details before copying</div>
              </div>
              <button onClick={() => setPreview(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <pre className="px-5 py-4 text-sm text-slate-700 whitespace-pre-wrap break-words max-h-[50vh] overflow-y-auto font-sans">{preview.scheduled_message}</pre>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100">
              {preview.feishu_url && (
                <a href={preview.feishu_url} target="_blank" rel="noreferrer" className="btn-secondary">Open in Feishu ↗</a>
              )}
              <button
                onClick={() => { navigator.clipboard.writeText(preview.scheduled_message || ''); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="btn-primary flex items-center gap-1.5">
                {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy Message'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
