'use client';

import { useEffect, useState } from 'react';
import { Users, Activity, TrendingUp, Zap } from 'lucide-react';
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

  const fetchData = async () => {
    if (!token) return;
    const [dashRes, tradersRes] = await Promise.all([
      fetch('/api/dashboard', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/traders', { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const [dashData, tradersData] = await Promise.all([dashRes.json(), tradersRes.json()]);
    setData(dashData);
    setTraders(tradersData);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [token]);

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
      value: data?.botStatus === 'running' ? 'Running' : 'Stopped',
      icon: Zap,
      color: data?.botStatus === 'running' ? 'text-emerald-400' : 'text-slate-500',
      bg: data?.botStatus === 'running' ? 'bg-emerald-500/10' : 'bg-slate-700/30',
    },
    {
      title: 'Mode',
      value: 'MIRROR',
      icon: TrendingUp,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Overview</h1>
        <p className="text-slate-500 text-sm mt-1">Real-time copy trading status</p>
      </div>

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
