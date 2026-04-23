'use client';

import { useEffect, useState } from 'react';
import { TradersManager } from '@/components/dashboard/TradersManager';
import { useAuth } from '@/components/providers/AuthProvider';

interface Trader {
  id: string;
  walletAddress: string;
  active: boolean;
  createdAt: string;
}

export default function TradersPage() {
  const { token } = useAuth();
  const [traders, setTraders] = useState<Trader[]>([]);

  const fetchTraders = async () => {
    if (!token) return;
    const res = await fetch('/api/traders', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (Array.isArray(data)) setTraders(data);
  };

  useEffect(() => {
    fetchTraders();
  }, [token]);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Traders</h1>
        <p className="text-slate-500 text-sm mt-1">Manage the wallets you copy trade from</p>
      </div>
      {token && (
        <TradersManager traders={traders} token={token} onUpdate={fetchTraders} />
      )}
    </div>
  );
}

