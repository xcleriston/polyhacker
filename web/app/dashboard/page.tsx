'use client';

import { useEffect, useState, useCallback } from 'react';
import { Users, Activity, TrendingUp, Zap, Play, Square, FlaskConical, Loader2, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { RecentTradesTable } from '@/components/dashboard/RecentTradesTable';
import { TradersManager } from '@/components/dashboard/TradersManager';
import { useAuth } from '@/components/providers/AuthProvider';
import { cn } from '@/lib/utils';

interface DashboardData {
  activeTraders: number;
  recentTrades: Array<{
    id: string;
    side: string;
    asset: string;
    usdcSize: number;
    price: number;
    orderType: string;
    status: string;
    market?: string;
    traderAddress: string;
    createdAt: string;
  }>;
  botStatus: 'running' | 'stopped';
  userActive?: boolean;
}

interface Trader {
  id: string;
  walletAddress: string;
  active: boolean;
  createdAt: string;
}

export default function DashboardPage() {
  const { token } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);
  const [botEnabled, setBotEnabled] = useState(false);
  const [testMode, setTestMode] = useState(true);
  const [toggling, setToggling] = useState(false);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const [dashRes, tradersRes, botRes] = await Promise.all([
        fetch('/api/dashboard', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/traders', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/bot/control', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const [dashData, tradersData, botData] = await Promise.all([
        dashRes.json(), tradersRes.json(), botRes.json()
      ]);
      setData(dashData);
      setTraders(tradersData);
      setBotEnabled(botData.botEnabled ?? false);
      setTestMode(botData.testMode ?? true);
    } catch (err) {
      console.error('Failed to fetch dashboard data', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleToggleBot = async () => {
    if (!token || toggling) return;
    setToggling(true);
    try {
      const res = await fetch('/api/bot/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ botEnabled: !botEnabled }),
      });
      if (res.ok) {
        const result = await res.json();
        setBotEnabled(result.botEnabled);
      }
    } finally {
      setToggling(false);
    }
  };

  const isRunning = botEnabled;

  const statCards = [
    {
      title: 'Active Traders',
      value: data?.activeTraders ?? '0',
      icon: Users,
      color: 'text-violet-400',
      bg: 'bg-violet-500/10',
    },
    {
      title: 'Recent Trades',
      value: data?.recentTrades.length ?? '0',
      icon: Activity,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
    {
      title: 'Bot Status',
      value: isRunning ? (testMode ? 'Test Mode' : 'Live') : 'Stopped',
      icon: isRunning && testMode ? FlaskConical : Zap,
      color: isRunning ? (testMode ? 'text-amber-400' : 'text-emerald-400') : 'text-slate-500',
      bg: isRunning ? (testMode ? 'bg-amber-500/10' : 'bg-emerald-500/10') : 'bg-slate-700/30',
    },
    {
      title: 'Bot Mode',
      value: isRunning ? 'MIRROR' : '—',
      icon: TrendingUp,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
    },
  ];

  if (!loading && data?.userActive === false) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
          <XCircle className="w-10 h-10 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-white">Conta Desativada</h1>
        <p className="text-slate-400 mt-2 max-w-md">
          Sua conta foi suspensa ou ainda não foi ativada pelo administrador. 
          Entre em contato com o suporte para mais informações.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-10">
      {/* Header + Start/Stop Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Overview</h1>
          <p className="text-slate-500 text-sm mt-1">Real-time copy trading feed and bot management</p>
        </div>

        <div className="flex items-center gap-4">
          {!loading && (
            <div className={cn(
              'hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider font-bold border',
              isRunning
                ? testMode
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-slate-800/50 border-slate-700/50 text-slate-500'
            )}>
              <span className={cn(
                'w-1.5 h-1.5 rounded-full',
                isRunning
                  ? testMode ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400 animate-pulse'
                  : 'bg-slate-600'
              )} />
              {isRunning ? (testMode ? 'Test Mode' : 'Live') : 'Stopped'}
            </div>
          )}

          <button
            id="bot-start-stop-btn"
            onClick={handleToggleBot}
            disabled={toggling || loading}
            className={cn(
              'flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xl',
              isRunning
                ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20'
                : 'bg-violet-600 hover:bg-violet-700 text-white shadow-violet-500/30'
            )}
          >
            {toggling ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isRunning ? (
              <Square className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current" />
            )}
            {toggling ? 'Updating...' : isRunning ? 'Stop Bot' : 'Start Bot'}
          </button>
        </div>
      </div>

      {/* Test Mode Notice */}
      {!loading && isRunning && testMode && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl px-6 py-4 flex items-center gap-4 text-sm animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
            <FlaskConical className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="text-amber-200 font-medium text-base">Test Mode Active</p>
            <p className="text-amber-500/80 text-xs mt-0.5">The bot is monitoring trades but NOT executing real orders. Change this in <a href="/dashboard/settings" className="font-bold hover:text-amber-300 transition-colors">Settings</a>.</p>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map(({ title, value, icon: Icon, color, bg }) => (
          <Card key={title} className="border-white/[0.06] bg-slate-900/40 hover:bg-slate-900/60 transition-colors overflow-hidden group">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">{title}</p>
                  <p className={cn('text-3xl font-black mt-2 tracking-tight transition-transform group-hover:scale-105 origin-left', color)}>
                    {loading ? (
                      <span className="inline-block w-12 h-8 bg-slate-800/50 animate-pulse rounded-md" />
                    ) : value}
                  </p>
                </div>
                <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner transition-transform group-hover:rotate-12', bg)}>
                  <Icon size={22} className={color} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Grid: 12 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Recent Trades: Spans 12 columns if loading or no traders, 8 columns otherwise */}
        <div className={cn(
          "transition-all duration-500",
          (loading || traders.length === 0) ? "lg:col-span-12" : "lg:col-span-8"
        )}>
          <Card className="border-white/[0.06] bg-slate-900/40 backdrop-blur-md overflow-hidden h-full">
            <CardHeader className="border-b border-white/[0.04] px-6 py-5 bg-white/[0.02]">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <Activity size={20} className="text-violet-400" />
                  Recent Trades
                </CardTitle>
                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Live Feed</div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-4">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-14 bg-slate-800/30 animate-pulse rounded-2xl" />
                  ))}
                </div>
              ) : (
                <div className="p-1">
                  <RecentTradesTable trades={data?.recentTrades ?? []} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Traders Manager: Spans 4 columns */}
        {!loading && token && traders.length > 0 && (
          <div className="lg:col-span-4 animate-in fade-in slide-in-from-right-4 duration-500">
            <TradersManager traders={traders} token={token} onUpdate={fetchData} />
          </div>
        )}
      </div>
    </div>
  );
}
