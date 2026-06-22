import React, { useEffect, useState, useCallback, createContext, useContext } from 'react';
import {
  Send, MessageSquareReply, Clapperboard, DollarSign, RefreshCw, Copy, Check,
  Store, CalendarClock, AlertTriangle, ListChecks, CalendarPlus, ChevronDown,
  Eye, X, Search, CheckCircle2, Circle, RotateCcw, WifiOff, Pencil, Lock,
} from 'lucide-react';
import { getFunnel, markFunnelAction, sendFunnelReply, resyncFunnel, editFunnelRow, resolveFunnelIssue } from '../lib/api';
import { useAppStore } from '../store';

// Lets any row's RowLinks open the edit modal without threading a callback through every
// component. Overview provides it; openEdit(row) is null for rows that can't be edited.
const EditCtx = createContext<((it: any) => void) | null>(null);

// Sending real IG DMs is gated to a direct localhost browser (the server also enforces this).
// On the public tunnel the send button is hidden — view/copy only.
const IS_LOCAL = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);

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

// "6/19 周四" — compact weekday label for the rest-of-week agenda
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function dayLabel(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()} ${WEEKDAYS[d.getDay()]}`;
}

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

// Recover the IG handle when the structured field is empty: the AI often writes it into
// the note ("@okkairi" or "账号名 lou.live.love") for new inbound that has no IG链接 yet.
function deriveHandle(it: any): string {
  if ((it.handle || '').trim()) return it.handle.trim();
  const blob = `${it.name || ''} ${it.note || ''}`;
  const at = blob.match(/@([A-Za-z0-9_.]{2,30})/);
  if (at) return at[1];
  const acct = (it.note || '').match(/账号名[\s:：]*([A-Za-z0-9_.]{2,30})/);
  return acct ? acct[1] : '';
}

// the influencer's REAL IG @handle — the unambiguous account id. Display names collide
// (there are 4 different "NYC Foodie"), so the handle is what tells you which account to
// reply to. Shown as readable text + click-through to IG, so you never open Feishu to find it.
function Handle({ it }: { it: any }) {
  if (it.channel === '邮件') return null;            // email rows: identified by name + 邮件 badge
  const h = deriveHandle(it);
  if (!h) return <span className="text-[11px] text-slate-400 flex-shrink-0" title="IG 私信请求，回复后才会显示账号">@? 待回复显账号</span>;
  return (
    <a href={`https://instagram.com/${h}`} target="_blank" rel="noreferrer"
       className="text-xs text-pink-600 hover:text-pink-700 font-medium flex-shrink-0">@{h}</a>
  );
}

function RowLinks({ it }: { it: any }) {
  const onEdit = useContext(EditCtx);
  // email-base leads (em_*) have no visits-table record → not editable from the board
  const canEdit = onEdit && !String(it.chat_id || '').startsWith('em_');
  return (
    <span className="flex items-center gap-1.5 flex-shrink-0">
      {it.feishu_url && (
        <a href={it.feishu_url} target="_blank" rel="noreferrer"
           className="text-[11px] text-blue-600 hover:text-blue-800 border border-blue-100 bg-blue-50 rounded px-1.5 py-0.5">飞书↗</a>
      )}
      {canEdit && (
        <button onClick={() => onEdit!(it)} title="改餐补/时间/状态（写回飞书）"
          className="text-[11px] text-slate-500 hover:text-slate-800 border border-slate-200 bg-slate-50 rounded px-1.5 py-0.5 inline-flex items-center gap-0.5">
          <Pencil size={10} />改
        </button>
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
          <Handle it={it} />
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

// "等3天" — how long the ball has sat in OUR court (since the influencer's last message).
// The 待回复 list is sorted oldest-first, so the reddest badges float to the top.
function Waited({ iso }: { iso: string | null }) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return null;
  const days = Math.floor(ms / 86400000), hrs = Math.floor(ms / 3600000);
  const txt = days >= 1 ? `等${days}天` : `等${hrs}小时`;
  const cls = days >= 3 ? 'bg-red-100 text-red-700' : days >= 1 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500';
  return <span className={`badge text-[10px] px-1.5 py-0 ${cls}`} title={`对方最后消息 ${iso.slice(0, 10)}`}>{txt}</span>;
}

function ActionRow({ it, right, done, onToggle, onDraft, waiting }: any) {
  return (
    <div className={`px-4 py-2 border-t border-slate-100 ${done ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Done on={done} onClick={onToggle} />
        <span className={`font-medium text-slate-800 text-sm truncate ${done ? 'line-through' : ''}`}>{it.name}</span>
        <Handle it={it} />
        <Chan c={it.channel} /><Owner name={it.owner} />
        <RowLinks it={it} />
        {onDraft && it.reply_draft && (
          <button onClick={() => onDraft(it)}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 flex-shrink-0">
            <Eye size={11} /> 查看草稿
          </button>
        )}
        <span className="ml-auto flex items-center gap-2">{right}{waiting ? <Waited iso={it.last_inbound || it.last_modified} /> : <Ago iso={it.last_modified} />}</span>
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

// one arriving influencer: time · name · restaurant · channel · 飞书↗.
// `showDay` adds the weekday (used in the rest-of-week column where dates vary).
function ArrivalRow({ it, big, showDay }: { it: any; big?: boolean; showDay?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t border-white/40 first:border-t-0">
      <span className={`font-mono font-bold flex-shrink-0 tabular-nums ${big ? 'text-base' : 'text-sm'} ${it.visit_time ? 'text-slate-900' : 'text-slate-400 text-xs'}`}>
        {showDay ? <span className="text-[11px] text-slate-500 font-sans font-medium mr-1">{dayLabel(it.visit_date)}</span> : null}
        {it.visit_time || '待定'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`font-semibold text-slate-800 truncate ${big ? '' : 'text-sm'}`}>{it.name}</span>
          <Handle it={it} />
          <Chan c={it.channel} />
        </div>
        <div className="text-xs text-slate-500 truncate">🍴 {it.restaurant || '未分配'}{it.owner ? ` · ${it.owner}` : ''}</div>
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
          ? <div className="px-3 py-4 text-center text-xs text-slate-400">无到店</div>
          : items.map((it: any) => <ArrivalRow key={it.chat_id} it={it} big={big} showDay={showDay} />)}
      </div>
    </div>
  );
}

// #3 in-board editing: change 餐补/Additional Payment/到店时间/状态 → writes straight to Feishu.
// Only sends fields the user actually changed. AI won't clobber a human-set credit/time (resolve()
// protects it); status can still be re-judged if a new message arrives (Phase 2 will lock it).
function EditModal({ it, statusOptions, onClose, onSaved }: any) {
  const { showToast } = useAppStore();
  const [credit, setCredit] = useState(it.dining_credit || '');
  const [addpay, setAddpay] = useState(it.add_pay_raw || '');
  const [visit, setVisit] = useState(it.visit_raw || '');
  const [status, setStatus] = useState(it.status || '');
  const [locked, setLocked] = useState(!!it.status_locked);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const fields: Record<string, any> = {};
    if (credit.trim() !== (it.dining_credit || '')) fields.dining_credit = credit.trim();
    if (addpay.trim() !== (it.add_pay_raw || '')) fields.additional_payment = addpay.trim();
    if (visit.trim() !== (it.visit_raw || '')) fields.visit_time = visit.trim();
    if (status !== (it.status || '')) fields.status = status;
    if (locked !== !!it.status_locked) fields.locked = locked;
    if (!Object.keys(fields).length && !it._issueId) { onClose(); return; }
    setSaving(true);
    try {
      if (Object.keys(fields).length) await editFunnelRow(it.chat_id, fields);
      if (it._issueId) await resolveFunnelIssue(it._issueId);   // close the AI issue this edit resolves
      showToast(it._issueId ? '已写回飞书并标记问题已解决' : '已写回飞书', 'success');
      onSaved();
    } catch (e: any) {
      showToast(e?.response?.data?.error || '写回失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div>
            <div className="font-semibold text-slate-900">编辑 · {it.name}</div>
            <div className="text-xs text-slate-500">{it.restaurant || '未分配'} · 直接写回飞书</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {it._issueDetail && (
            <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-800">
              ⚠️ AI 检出：{it._issueDetail}
              {it.ai_value ? <div className="mt-0.5">建议值：<b>{it.ai_value}</b>{it.current_value ? `（当前：${it.current_value}）` : ''}</div> : null}
              <div className="text-[11px] text-amber-600 mt-0.5">改完保存会自动把这条问题标记已解决</div>
            </div>
          )}
          <label className="block">
            <span className="text-xs font-medium text-slate-600">餐补 Dining Credit</span>
            <input value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="如 $80 (food only)"
              className="input w-full mt-1 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">额外现金 Additional Payment</span>
            <input value={addpay} onChange={(e) => setAddpay(e.target.value)} placeholder="如 $35（无则留空）"
              className="input w-full mt-1 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">到店时间</span>
            <input value={visit} onChange={(e) => setVisit(e.target.value)} placeholder="2026-06-20 6:00 PM"
              className="input w-full mt-1 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">状态</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="input w-full mt-1 text-sm">
              {status && !statusOptions.includes(status) && <option value={status}>{status}</option>}
              {statusOptions.map((s: string) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} className="rounded" />
            <Lock size={12} className={locked ? 'text-amber-600' : 'text-slate-400'} />
            <span className="text-xs text-slate-600">锁定状态 — AI 不再重判此对话{status !== (it.status || '') && !locked ? '（改了状态会自动锁）' : ''}</span>
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100">
          {it.feishu_url && <a href={it.feishu_url} target="_blank" rel="noreferrer" className="btn-secondary">飞书打开 ↗</a>}
          <button onClick={onClose} className="btn-secondary">取消</button>
          <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">{saving ? '保存中…' : '保存并写回飞书'}</button>
        </div>
      </div>
    </div>
  );
}

// ⚠️ Issue section — ONLY exceptions that need a human decision (conflicts/errors/inconsistencies),
// not routine workflow. Each row carries a one-click resolution that reuses the #3 write-back.
const ISSUE_STYLE: Record<string, { dot: string; tag: string; label: string }> = {
  error:    { dot: 'bg-red-500',    tag: 'bg-red-100 text-red-700',       label: '报错' },
  conflict: { dot: 'bg-amber-500',  tag: 'bg-amber-100 text-amber-700',   label: '冲突' },
  decision: { dot: 'bg-blue-500',   tag: 'bg-blue-100 text-blue-700',     label: '待决策' },
  gap:      { dot: 'bg-slate-400',  tag: 'bg-slate-100 text-slate-600',   label: '缺口' },
};
function IssueSection({ issues, onEdit, onFix, onResolve, fixing, resolving }: any) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50/60 overflow-hidden">
      <div className="px-4 py-2.5 flex items-center gap-2 bg-amber-100/70">
        <AlertTriangle size={16} className="text-amber-600" />
        <span className="font-bold text-sm text-amber-900">需要你处理</span>
        <span className="text-[11px] text-amber-700">系统卡住 / 数据矛盾，需你拍板</span>
        <span className="badge ml-auto bg-amber-200 text-amber-800">{issues.length}</span>
      </div>
      <div className="bg-white/60 divide-y divide-amber-100 max-h-72 overflow-y-auto">
        {issues.map((it: any) => {
          const s = ISSUE_STYLE[it.sev] || ISSUE_STYLE.gap;
          return (
            <div key={`${it.chat_id}-${it.issue}`} className="flex items-center gap-3 px-4 py-2.5">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`badge ${s.tag}`}>{s.label}</span>
                  <span className="font-semibold text-sm text-slate-800">{it.title}</span>
                  <span className="text-xs text-slate-500">· {it.name}</span>
                  <Chan c={it.channel} />
                </div>
                <div className="text-xs text-slate-500 truncate mt-0.5">{it.detail}</div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {it.feishu_url && (
                  <a href={it.feishu_url} target="_blank" rel="noreferrer"
                     className="text-[11px] text-blue-600 hover:text-blue-800 border border-blue-100 bg-blue-50 rounded px-1.5 py-0.5">飞书↗</a>
                )}
                {it.source === 'ai' ? (
                  <>
                    {!String(it.chat_id || '').startsWith('em_') && (
                      <button onClick={() => onEdit({ ...it, _issueId: it.issue_id, _issueDetail: it.detail })}
                        className="btn-secondary text-xs py-1 px-2.5 inline-flex items-center gap-1"><Pencil size={11} />去解决</button>
                    )}
                    <button onClick={() => onResolve(it.issue_id)} disabled={resolving === it.issue_id}
                      className="btn-secondary text-xs py-1 px-2.5 disabled:opacity-50">{resolving === it.issue_id ? '…' : '已解决'}</button>
                  </>
                ) : it.issue === 'dirty_msg' ? (
                  <button onClick={() => onFix(it)} disabled={fixing === it.chat_id}
                    className="btn-primary text-xs py-1 px-2.5 disabled:opacity-50">{fixing === it.chat_id ? '修正中…' : '一键修'}</button>
                ) : it.issue === 'pub_no_link' ? (
                  it.feishu_url && <a href={it.feishu_url} target="_blank" rel="noreferrer" className="btn-secondary text-xs py-1 px-2.5">去补链接</a>
                ) : (
                  <button onClick={() => onEdit(it)} className="btn-secondary text-xs py-1 px-2.5 inline-flex items-center gap-1"><Pencil size={11} />去修</button>
                )}
              </div>
            </div>
          );
        })}
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
  const [draftText, setDraftText] = useState('');     // editable AI draft in the modal
  const [sending, setSending] = useState(false);
  const [, setTick] = useState(0);                    // re-render relative times
  const [override, setOverride] = useState<Record<string, boolean>>({}); // optimistic done state
  const [edit, setEdit] = useState<any>(null);        // #3: row being edited (餐补/时间/状态)
  const [fixing, setFixing] = useState<string | null>(null);  // chat_id mid 一键修
  const [resolving, setResolving] = useState<string | null>(null);  // issue_id mid 已解决

  const load = useCallback((silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    getFunnel(activeCampaign ? { restaurant: activeCampaign.name } : undefined)
      .then((r) => { setData(r.data); setError(false); setOverride({}); }) // server is truth after refetch
      .catch(() => setError(true))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, [activeCampaign]);

  // Manual 刷新: pull Feishu → mirror NOW, then re-read. (Auto-refresh below stays a cheap
  // mirror-only read — no point hammering the Feishu API every 3 min from every open tab.)
  const refresh = useCallback(() => {
    setRefreshing(true);
    resyncFunnel()
      .catch(() => showToast('拉取飞书失败，显示的是本地缓存', 'error'))
      .finally(() => load(true));   // re-reads the now-updated mirror; clears the spinner
  }, [load]);

  // 文案脏 one-click: collapse ") (covers food only)" → ")" and write the cleaned message to Feishu.
  const fixDirtyMsg = (it: any) => {
    const cleaned = (it.scheduled_message || '').replace(/\)\s+\(covers food only\)/g, ')');
    setFixing(it.chat_id);
    editFunnelRow(it.chat_id, { scheduled_message: cleaned })
      .then(() => { showToast('已修正文案并写回飞书', 'success'); load(true); })
      .catch((e: any) => showToast(e?.response?.data?.error || '修正失败', 'error'))
      .finally(() => setFixing(null));
  };

  // Phase 2: mark an AI-raised issue resolved (no field change — e.g. false alarm / handled in Feishu)
  const resolveAiIssue = (issueId: string) => {
    setResolving(issueId);
    resolveFunnelIssue(issueId)
      .then(() => { showToast('已标记问题已解决', 'success'); load(true); })
      .catch((e: any) => showToast(e?.response?.data?.error || '操作失败', 'error'))
      .finally(() => setResolving(null));
  };

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
  const onView = (x: any) => { setPreview({ ...x, _text: x.scheduled_message, _kind: 'invite' }); setCopied(false); };
  const onDraft = (x: any) => { setPreview({ ...x, _text: x.reply_draft, _kind: 'draft' }); setDraftText(x.reply_draft || ''); setCopied(false); };
  // send the (possibly edited) draft as an IG DM via Unipile, then mark 已回复 and close.
  const sendDraft = async () => {
    if (!preview || !draftText.trim() || sending) return;
    if (!confirm(`确认把这条消息发送到 IG 给 ${preview.name}？发送后不可撤回。`)) return;
    setSending(true);
    try {
      await sendFunnelReply(preview.chat_id, draftText);
      setOverride((o) => ({ ...o, [preview.chat_id]: true })); // optimistically leave the queue
      showToast(`已发送给 ${preview.name}`, 'success');
      setPreview(null);
      load(true);
    } catch (e: any) {
      showToast(e?.response?.data?.error || '发送失败', 'error');
    } finally {
      setSending(false);
    }
  };
  // can one-click send only for an IG draft, on a direct-localhost browser (server also guards)
  const canSend = !!preview && preview._kind === 'draft' && IS_LOCAL && !String(preview.chat_id || '').startsWith('em_');

  return (
    <EditCtx.Provider value={setEdit}>
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
          <button className="btn-secondary flex items-center gap-1" onClick={refresh} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />刷新
          </button>
        </div>
      </div>

      {/* ⚠️ 需要你处理 — exceptions needing a decision, pinned above everything */}
      {data.issues?.length > 0 && (
        <IssueSection issues={data.issues} onEdit={setEdit} onFix={fixDirtyMsg} onResolve={resolveAiIssue} fixing={fixing} resolving={resolving} />
      )}

      {/* 📅 本周到店 — the daily-glance agenda, FIRST thing on the board */}
      {(() => {
        const a = data.arrivals || { today: [], tomorrow: [], later: [] };
        const totalWeek = a.today.length + a.tomorrow.length + a.later.length;
        return (
          <section>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <CalendarClock size={18} className="text-rose-600" />
              <h2 className="text-base font-bold text-slate-900">近期到店</h2>
              <span className="text-xs text-slate-400">谁来 · 几点 · 哪家店 — 未来 7 天，每天先看这里</span>
              <span className="badge ml-auto bg-rose-100 text-rose-700">{totalWeek} 位</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
              <ArrivalDay title="今天" items={a.today} big showDay={false}
                accent={{ border: 'border-rose-200', bg: 'bg-rose-50', head: 'bg-rose-100/60', text: 'text-rose-700', badge: 'bg-rose-200 text-rose-800' }} />
              <ArrivalDay title="明天" items={a.tomorrow} showDay={false}
                accent={{ border: 'border-amber-200', bg: 'bg-amber-50', head: 'bg-amber-100/60', text: 'text-amber-700', badge: 'bg-amber-200 text-amber-800' }} />
              <ArrivalDay title="接下来" items={a.later} showDay
                accent={{ border: 'border-slate-200', bg: 'bg-slate-50', head: 'bg-slate-100/60', text: 'text-slate-600', badge: 'bg-slate-200 text-slate-700' }} />
            </div>
          </section>
        );
      })()}

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
            {view(t.reply_needed).map((it: any) => <ActionRow key={it.chat_id} it={it} done={isHandled(it)} onToggle={() => mark(it, "reply")} onDraft={onDraft} waiting />)}
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
                <div className="font-semibold text-slate-900">
                  {preview._kind === 'draft' ? `回复 ${preview.name}（AI 草稿）` : `${preview.name} 的邀约消息`}
                </div>
                <div className="text-xs text-slate-500">
                  {preview._kind === 'draft'
                    ? `${preview.restaurant}${deriveHandle(preview) ? ' · @' + deriveHandle(preview) : ''} · ${canSend ? '可编辑后一键发送到 IG' : '编辑后复制，手动发送'}`
                    : `${preview.visit_date} ${preview.visit_time} · ${preview.restaurant} · 确认无误再复制`}
                </div>
              </div>
              <button onClick={() => setPreview(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            {preview._kind === 'draft' ? (
              <textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                className="w-full px-5 py-4 text-sm text-slate-700 break-words max-h-[50vh] min-h-[160px] overflow-y-auto font-sans resize-none focus:outline-none border-0"
              />
            ) : (
              <pre className="px-5 py-4 text-sm text-slate-700 whitespace-pre-wrap break-words max-h-[50vh] overflow-y-auto font-sans">{preview._text}</pre>
            )}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100">
              {preview._kind === 'draft' && deriveHandle(preview) && (
                <a href={`https://instagram.com/${deriveHandle(preview)}`} target="_blank" rel="noreferrer" className="btn-secondary">去 IG 对话 ↗</a>
              )}
              {preview.feishu_url && (
                <a href={preview.feishu_url} target="_blank" rel="noreferrer" className="btn-secondary">飞书打开此行 ↗</a>
              )}
              <button
                onClick={() => { navigator.clipboard.writeText((preview._kind === 'draft' ? draftText : preview._text) || ''); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className={`${canSend ? 'btn-secondary' : 'btn-primary'} flex items-center gap-1.5`}>
                {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? '已复制' : '复制'}
              </button>
              {canSend && (
                <button
                  onClick={sendDraft}
                  disabled={sending || !draftText.trim()}
                  className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
                  <Send size={14} />{sending ? '发送中…' : '发送到 IG'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    {edit && (
      <EditModal it={edit} statusOptions={data.statuses || []}
        onClose={() => setEdit(null)}
        onSaved={() => { setEdit(null); load(true); }} />
    )}
    </EditCtx.Provider>
  );
}
