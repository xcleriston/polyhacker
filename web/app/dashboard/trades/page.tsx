'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { RecentTradesTable } from '@/components/dashboard/RecentTradesTable';
import { useAuth } from '@/components/providers/AuthProvider';

interface Trade {
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
}

export default function TradesPage() {
  const { token } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch('/api/dashboard', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        setTrades(data.recentTrades ?? []);
        setLoading(false);
      });
  }, [token]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Recent Trades</h1>
        <p className="text-slate-500 text-sm mt-1">Latest copied trades from your tracked wallets</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Trade History</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="animate-pulse space-y-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-10 bg-slate-800/50 rounded-lg" />
              ))}
            </div>
          ) : (
            <RecentTradesTable trades={trades} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
