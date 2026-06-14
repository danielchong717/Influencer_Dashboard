import React, { useState } from 'react';
import {
  Mail, GitBranch, Calendar, CreditCard, BarChart3, Star, Zap, LayoutDashboard, ChevronDown
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAppStore } from '../../store';
import type { TabId } from '../../types';

type NavItem = { id: TabId; label: string; icon: React.ReactNode; description: string };

// The one page that matters: the Feishu funnel mirror.
const PRIMARY: NavItem[] = [
  { id: 'overview', label: '总览', icon: <LayoutDashboard size={18} />, description: '网红合作进度' },
];

// Everything else is the original (heavier) CRM — tucked under a collapsible "更多".
// Outreach stays out entirely: outreach + open-tracking is done upstream in Feishu.
const MORE: NavItem[] = [
  { id: 'pipeline', label: '流水线', icon: <GitBranch size={18} />, description: '看板阶段' },
  { id: 'content', label: '内容排期', icon: <Calendar size={18} />, description: '交付与数据' },
  { id: 'payment', label: '付款', icon: <CreditCard size={18} />, description: '账单与状态' },
  { id: 'report', label: '报表', icon: <BarChart3 size={18} />, description: '分析与洞察' },
  { id: 'longterm', label: '长期合作', icon: <Star size={18} />, description: '签约博主' },
];

export default function Sidebar() {
  const { activeTab, setActiveTab, activeCampaign } = useAppStore();
  const [moreOpen, setMoreOpen] = useState(false);

  const renderItem = (item: NavItem) => (
    <button
      key={item.id}
      onClick={() => setActiveTab(item.id)}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all group',
        activeTab === item.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
      )}
    >
      <span className={cn('flex-shrink-0', activeTab === item.id ? 'text-white' : 'text-slate-400 group-hover:text-slate-300')}>
        {item.icon}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium leading-tight">{item.label}</div>
        <div className={cn('text-xs mt-0.5 truncate', activeTab === item.id ? 'text-blue-200' : 'text-slate-600 group-hover:text-slate-500')}>
          {item.description}
        </div>
      </div>
    </button>
  );

  return (
    <aside className="w-60 bg-[#0f172a] flex flex-col h-screen sticky top-0 flex-shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Zap size={16} className="text-white" />
          </div>
          <div>
            <div className="text-white font-semibold text-sm leading-tight">网红中心</div>
            <div className="text-slate-500 text-xs">营销看板</div>
          </div>
        </div>
      </div>

      {/* Campaign badge */}
      {activeCampaign && (
        <div className="mx-3 mt-3 px-3 py-2 bg-slate-800 rounded-lg">
          <div className="text-xs text-slate-400 mb-0.5">Active Campaign</div>
          <div className="text-white text-xs font-medium truncate">{activeCampaign.name}</div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {PRIMARY.map(renderItem)}

        {/* collapsible "更多" — the original heavier CRM pages, hidden by default */}
        <button
          onClick={() => setMoreOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-2.5 mt-2 rounded-lg text-left text-slate-500 hover:text-white hover:bg-slate-800 transition-all"
        >
          <ChevronDown size={16} className={cn('transition-transform', moreOpen ? '' : '-rotate-90')} />
          <span className="text-sm font-medium">更多</span>
        </button>
        {moreOpen && <div className="space-y-0.5 pl-1">{MORE.map(renderItem)}</div>}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-slate-800">
        <div className="text-xs text-slate-600 text-center">v1.0.0 · Spring 2026</div>
      </div>
    </aside>
  );
}
