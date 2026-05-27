import React from 'react';
import {
  Mail, GitBranch, Calendar, CreditCard, BarChart3, Star, Zap
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAppStore } from '../../store';
import type { TabId } from '../../types';

const NAV_ITEMS: { id: TabId; label: string; icon: React.ReactNode; description: string }[] = [
  { id: 'outreach', label: 'Outreach', icon: <Mail size={18} />, description: 'Email & follow-ups' },
  { id: 'pipeline', label: 'Pipeline', icon: <GitBranch size={18} />, description: 'Campaign stages' },
  { id: 'content', label: 'Content Schedule', icon: <Calendar size={18} />, description: 'Delivery & metrics' },
  { id: 'payment', label: 'Payment', icon: <CreditCard size={18} />, description: 'Invoices & status' },
  { id: 'report', label: 'Report', icon: <BarChart3 size={18} />, description: 'Analytics & insights' },
  { id: 'longterm', label: 'Long-term Partners', icon: <Star size={18} />, description: 'Signed partners' },
];

export default function Sidebar() {
  const { activeTab, setActiveTab, activeCampaign } = useAppStore();

  return (
    <aside className="w-60 bg-[#0f172a] flex flex-col h-screen sticky top-0 flex-shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Zap size={16} className="text-white" />
          </div>
          <div>
            <div className="text-white font-semibold text-sm leading-tight">Influencer Hub</div>
            <div className="text-slate-500 text-xs">Marketing CRM</div>
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
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all group',
              activeTab === item.id
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
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
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-slate-800">
        <div className="text-xs text-slate-600 text-center">v1.0.0 · Spring 2026</div>
      </div>
    </aside>
  );
}
