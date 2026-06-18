import { create } from 'zustand';
import type { Campaign, TabId } from '../types';

interface AppState {
  activeCampaign: Campaign | null;
  campaigns: Campaign[];
  activeTab: TabId;
  gmailConnected: boolean;
  gmailEmail: string | null;
  sidebarOpen: boolean;            // mobile drawer open/closed
  toast: { message: string; type: 'success' | 'error' | 'info' } | null;
  setActiveCampaign: (c: Campaign | null) => void;
  setCampaigns: (cs: Campaign[]) => void;
  setActiveTab: (t: TabId) => void;
  setGmailConnected: (v: boolean, email?: string) => void;
  setSidebarOpen: (v: boolean) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  clearToast: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeCampaign: null,
  campaigns: [],
  activeTab: 'overview',
  gmailConnected: false,
  gmailEmail: null,
  sidebarOpen: false,
  toast: null,
  setActiveCampaign: (c) => set({ activeCampaign: c }),
  setCampaigns: (cs) => set({ campaigns: cs }),
  setActiveTab: (t) => set({ activeTab: t }),
  setGmailConnected: (v, email) => set({ gmailConnected: v, gmailEmail: email || null }),
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  showToast: (message, type = 'success') => {
    set({ toast: { message, type } });
    setTimeout(() => set({ toast: null }), 3500);
  },
  clearToast: () => set({ toast: null }),
}));
