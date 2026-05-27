import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import { useAppStore } from '../../store';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { toast, clearToast } = useAppStore();

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Toast */}
      {toast && (
        <div className={cn(
          'fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium max-w-sm',
          toast.type === 'success' && 'bg-green-50 border-green-200 text-green-800',
          toast.type === 'error' && 'bg-red-50 border-red-200 text-red-800',
          toast.type === 'info' && 'bg-blue-50 border-blue-200 text-blue-800',
        )}>
          {toast.type === 'success' && <CheckCircle size={16} className="text-green-600 flex-shrink-0" />}
          {toast.type === 'error' && <XCircle size={16} className="text-red-600 flex-shrink-0" />}
          {toast.type === 'info' && <Info size={16} className="text-blue-600 flex-shrink-0" />}
          <span className="flex-1">{toast.message}</span>
          <button onClick={clearToast} className="text-current opacity-60 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
