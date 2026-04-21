'use client';

import { useEffect, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

interface TopbarProps {
  userEmail?: string;
}

export function Topbar({ userEmail }: TopbarProps) {
  const [botStatus, setBotStatus] = useState<'running' | 'stopped' | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('ph_token');
    if (!token) return;
    fetch('/api/dashboard', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setBotStatus(data.botStatus))
      .catch(() => {});
  }, []);

  return (
    <header className="h-14 border-b border-white/[0.06] bg-slate-950/80 backdrop-blur-sm flex items-center justify-between px-6">
      <div />
      <div className="flex items-center gap-4">
        {botStatus !== null && (
          <div className="flex items-center gap-2 text-xs font-medium">
            {botStatus === 'running' ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-emerald-400">Bot Running</span>
              </>
            ) : (
              <>
                <WifiOff size={12} className="text-slate-500" />
                <span className="text-slate-500">Bot Stopped</span>
              </>
            )}
          </div>
        )}
        <div className="h-4 w-px bg-white/10" />
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-violet-600/30 border border-violet-500/30 flex items-center justify-center text-xs font-semibold text-violet-300">
            {userEmail?.[0]?.toUpperCase() ?? '?'}
          </div>
          <span className="text-xs text-slate-400 max-w-[160px] truncate">{userEmail}</span>
        </div>
      </div>
    </header>
  );
}
