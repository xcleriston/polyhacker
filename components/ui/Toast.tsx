'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export interface ToastProps {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info';
}

interface ToastContextValue {
  toasts: ToastProps[];
  toast: (message: string, type?: ToastProps['type']) => void;
}

import { createContext, useContext } from 'react';

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastProps[]>([]);

  const toast = (message: string, type: ToastProps['type'] = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  };

  return (
    <ToastContext.Provider value={{ toasts, toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium shadow-2xl pointer-events-auto',
              'animate-in slide-in-from-right-4 fade-in duration-300',
              t.type === 'success' && 'bg-emerald-900/90 border border-emerald-500/40 text-emerald-200',
              t.type === 'error' && 'bg-red-900/90 border border-red-500/40 text-red-200',
              t.type === 'info' && 'bg-slate-800/90 border border-white/10 text-slate-200'
            )}
          >
            {t.type === 'success' && <span>✅</span>}
            {t.type === 'error' && <span>❌</span>}
            {t.type === 'info' && <span>ℹ️</span>}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

