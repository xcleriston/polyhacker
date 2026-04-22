'use client';

import { useEffect, useState, useCallback } from 'react';
import { Users, Activity, TrendingUp, Zap, Play, Square, FlaskConical, Loader2 } from 'lucide-react';
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
    setLoading(false);
  }, [token]);

  useEffect(() => {
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
      value: data?.activeTraders ?? '—',
      icon: Users,
      color: 'text-violet-400',
      bg: 'bg-violet-500/10',
    },
    {
      title: 'Recent Trades',
      value: data?.recentTrades.length ?? '—',
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
      title: 'Mode',
      value: data?.botStatus === 'running' ? 'MIRROR' : '—',
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
    <div className="space-y-6">
      {/* Header + Start/Stop Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Overview</h1>
          <p className="text-slate-500 text-sm mt-1">Real-time copy trading status</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Status indicator */}
          {!loading && (
            <div className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border',
              isRunning
                ? testMode
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            )}>
              <span className={cn(
                'w-2 h-2 rounded-full',
                isRunning
                  ? testMode ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400 animate-pulse'
                  : 'bg-slate-600'
              )} />
              {isRunning ? (testMode ? '🧪 Test Mode' : '⚡ Live') : 'Stopped'}
            </div>
          )}

          {/* Start / Stop button */}
          <button
            id="bot-start-stop-btn"
            onClick={handleToggleBot}
            disabled={toggling || loading}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg',
              isRunning
                ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-900/30'
                : 'bg-violet-600 hover:bg-violet-700 text-white shadow-violet-900/30'
            )}
          >
            {toggling ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isRunning ? (
              <Square className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current" />
            )}
            {toggling ? 'Aguarde...' : isRunning ? 'Stop Bot' : 'Start Bot'}
          </button>
        </div>
      </div>

      {/* Test Mode Notice when running in test mode */}
      {!loading && isRunning && testMode && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 flex items-center gap-3 text-sm">
          <FlaskConical className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-amber-300">
            <span className="font-semibold">Test Mode ativo</span> — O bot detecta trades mas não executa ordens reais.
            Para ativar o modo real, vá em{' '}
            <a href="/dashboard/settings" className="underline hover:text-amber-200">Settings</a>.
          </p>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map(({ title, value, icon: Icon, color, bg }) => (
          <Card key={title}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">{title}</p>
                  <p className={cn('text-2xl font-bold mt-2', color)}>{loading ? '—' : value}</p>
                </div>
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', bg)}>
                  <Icon size={18} className={color} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid xl:grid-cols-[1fr_380px] gap-6">
        {/* Recent trades */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Trades</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="animate-pulse space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-10 bg-slate-800/50 rounded-lg" />
                ))}
              </div>
            ) : (
              <RecentTradesTable trades={data?.recentTrades ?? []} />
            )}
          </CardContent>
        </Card>

        {/* Traders manager */}
        {!loading && token && (
          <TradersManager traders={traders} token={token} onUpdate={fetchData} />
        )}
      </div>
    </div>
  );
}
