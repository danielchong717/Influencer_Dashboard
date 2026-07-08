import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number | undefined | null): string {
  if (n == null) return '—';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function formatCurrency(amount: number | undefined | null, currency = 'USD'): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

export function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatShortDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function isOverdue(dateStr: string | undefined | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

export function getPlatformColor(platform: string): string {
  const map: Record<string, string> = {
    TikTok: 'bg-black text-white',
    YouTube: 'bg-red-100 text-red-700',
    Instagram: 'bg-pink-100 text-pink-700',
    RedNote: 'bg-rose-100 text-rose-700',
  };
  return map[platform] || 'bg-slate-100 text-slate-700';
}

export function getPlatformIcon(platform: string): string {
  const map: Record<string, string> = {
    TikTok: '🎵',
    YouTube: '▶️',
    Instagram: '📸',
    RedNote: '📕',
  };
  return map[platform] || '🌐';
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    added: 'bg-gray-100 text-gray-500',
    pending: 'bg-slate-100 text-slate-600',
    sent: 'bg-blue-100 text-blue-700',
    opened: 'bg-indigo-100 text-indigo-700',
    seen: 'bg-indigo-100 text-indigo-700',
    replied: 'bg-purple-100 text-purple-700',
    negotiating: 'bg-amber-100 text-amber-700',
    confirmed: 'bg-green-100 text-green-700',
    posted: 'bg-teal-100 text-teal-700',
    paid: 'bg-emerald-100 text-emerald-700',
    active: 'bg-green-100 text-green-700',
    completed: 'bg-slate-100 text-slate-600',
    paused: 'bg-yellow-100 text-yellow-700',
    scheduled: 'bg-teal-100 text-teal-700',
    published: 'bg-slate-100 text-slate-600',
  };
  return map[status] || 'bg-slate-100 text-slate-600';
}

export function calcScore(engagement: number, views24h: number, views7d: number): number {
  return parseFloat(((engagement * 0.4) + (views24h / 100000 * 0.3) + (views7d / 300000 * 0.3)).toFixed(1));
}

export function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - new Date().getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
