import React, { useState } from 'react';
import {
  GitBranch, Calendar, CreditCard, BarChart3, Star, Zap, LayoutDashboard, ChevronDown, X
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAppStore } from '../../store';
import type { TabId } from '../../types';

type NavItem = { id: TabId; label: string; icon: React.ReactNode; description: string };

// The one page that matters: the Feishu funnel mirror.
const PRIMARY: NavItem[] = [
  { id: 'overview', label: '总览', icon: <LayoutDashboard size={20} />, description: '网红合作进度' },
];

// Everything else is the original (heavier) CRM — tucked under a collapsible "更多".
// Outreach stays out entirely: outreach + open-tracking is done upstream in Feishu.
const MORE: NavItem[] = [
  { id: 'pipeline', label: '流水线', icon: <GitBranch size={20} />, description: '看板阶段' },
  { id: 'content', label: '内容排期', icon: <Calendar size={20} />, description: '交付与数据' },
  { id: 'payment', label: '付款', icon: <CreditCard size={20} />, description: '账单与状态' },
  { id: 'report', label: '报表', icon: <BarChart3 size={20} />, description: '分析与洞察' },
  { id: 'longterm', label: '长期合作', icon: <Star size={20} />, description: '签约博主' },
];

const RAIL = 'w-16';        // collapsed footprint (64px) — reclaims space for the board
const OPEN = 'w-60';        // expanded width (hover overlay on desktop / drawer on mobile)

export default function Sidebar() {
  const { activeTab, setActiveTab, sidebarOpen, setSidebarOpen } = useAppStore();
  const [moreOpen, setMoreOpen] = useState(false);

  // one row: fixed 64px icon column (so the icon centers perfectly in the rail) + label that
  // fades in only when expanded. `mobile` forces the label visible (no hover on touch).
  const renderItem = (item: NavItem, mobile: boolean) => (
    <button
      key={item.id}
      onClick={() => { setActiveTab(item.id); if (mobile) setSidebarOpen(false); }}
      title={item.label}
      className={cn(
        'w-full flex items-center h-12 rounded-lg transition-colors',
        activeTab === item.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
      )}
    >
      <span className="w-16 flex-shrink-0 flex items-center justify-center">{item.icon}</span>
      <span className={cn('min-w-0 text-left whitespace-nowrap pr-3',
        mobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 transition-opacity duration-150')}>
        <span className="block text-sm font-medium leading-tight">{item.label}</span>
        <span className={cn('block text-[11px] truncate', activeTab === item.id ? 'text-blue-200' : 'text-slate-500')}>
          {item.description}
        </span>
      </span>
    </button>
  );

  // shared inner: logo → nav (总览 + 更多) → footer. `mobile` toggles always-on labels.
  const inner = (mobile: boolean) => (
    <>
      {/* Logo row — icon stays in the 64px column, name reveals on expand */}
      <div className="h-16 flex items-center border-b border-slate-800 flex-shrink-0">
        <span className="w-16 flex-shrink-0 flex items-center justify-center">
          <span className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
            <Zap size={18} className="text-white" />
          </span>
        </span>
        <span className={cn('whitespace-nowrap', mobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 transition-opacity duration-150')}>
          <span className="block text-white font-semibold text-sm leading-tight">网红中心</span>
          <span className="block text-slate-500 text-xs">营销看板</span>
        </span>
        {mobile && (
          <button onClick={() => setSidebarOpen(false)} className="ml-auto mr-3 text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto overflow-x-hidden">
        {PRIMARY.map((it) => renderItem(it, mobile))}

        {/* collapsible "更多" — heavier CRM pages, hidden by default */}
        <button
          onClick={() => setMoreOpen((v) => !v)}
          title="更多"
          className="w-full flex items-center h-12 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <span className="w-16 flex-shrink-0 flex items-center justify-center">
            <ChevronDown size={18} className={cn('transition-transform', moreOpen ? '' : '-rotate-90')} />
          </span>
          <span className={cn('text-sm font-medium whitespace-nowrap',
            mobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 transition-opacity duration-150')}>更多</span>
        </button>
        {moreOpen && MORE.map((it) => renderItem(it, mobile))}
      </nav>

      {/* Footer — only meaningful when expanded */}
      <div className="h-10 flex items-center justify-center border-t border-slate-800 flex-shrink-0 overflow-hidden">
        <span className={cn('text-[11px] text-slate-600 whitespace-nowrap',
          mobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 transition-opacity duration-150')}>v1.0.0 · Spring 2026</span>
      </div>
    </>
  );

  return (
    <>
      {/* DESKTOP: slim icon rail that expands to a floating panel on hover (no content shift) */}
      <div className={cn('hidden md:block flex-shrink-0 relative z-30', RAIL)}>
        <aside
          className={cn(
            'group absolute inset-y-0 left-0 bg-[#0f172a] flex flex-col h-screen overflow-hidden',
            'transition-[width] duration-200 ease-out shadow-xl shadow-black/20',
            'w-16 hover:w-60'   // literal so Tailwind JIT emits the hover-width rule
          )}
        >
          {inner(false)}
        </aside>
      </div>

      {/* MOBILE: off-canvas drawer + backdrop (never eats content width) */}
      <div
        className={cn('md:hidden fixed inset-0 z-50 transition-opacity duration-200',
          sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')}
        onClick={() => setSidebarOpen(false)}
      >
        <div className="absolute inset-0 bg-black/50" />
        <aside
          onClick={(e) => e.stopPropagation()}
          className={cn('absolute inset-y-0 left-0 bg-[#0f172a] flex flex-col h-screen shadow-2xl transition-transform duration-200',
            OPEN, sidebarOpen ? 'translate-x-0' : '-translate-x-full')}
        >
          {inner(true)}
        </aside>
      </div>
    </>
  );
}
