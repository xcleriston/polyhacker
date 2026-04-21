'use client';

import { useState } from 'react';
import { UserPlus, Trash2, ToggleLeft, ToggleRight, Copy } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

interface Trader {
  id: string;
  walletAddress: string;
  active: boolean;
  createdAt: string;
}

interface TradersManagerProps {
  traders: Trader[];
  token: string;
  onUpdate: () => void;
}

export function TradersManager({ traders, token, onUpdate }: TradersManagerProps) {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const { toast } = useToast();

  const addTrader = async () => {
    if (!address.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/traders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ walletAddress: address.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast('Trader added successfully', 'success');
      setAddress('');
      onUpdate();
    } catch (err: unknown) {
      toast((err as Error).message || 'Failed to add trader', 'error');
    } finally {
      setLoading(false);
    }
  };

  const removeTrader = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/traders/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to remove trader');
      toast('Trader removed', 'info');
      onUpdate();
    } catch (err: unknown) {
      toast((err as Error).message, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const toggleTrader = async (id: string, active: boolean) => {
    setTogglingId(id);
    try {
      const res = await fetch(`/api/traders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ active: !active }),
      });
      if (!res.ok) throw new Error('Failed to update trader');
      toast(`Trader ${!active ? 'activated' : 'paused'}`, 'success');
      onUpdate();
    } catch (err: unknown) {
      toast((err as Error).message, 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    toast('Address copied', 'info');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tracked Traders</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Trader Input */}
        <div className="flex gap-3">
          <Input
            placeholder="0x... wallet address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTrader()}
            className="flex-1"
          />
          <Button onClick={addTrader} loading={loading} size="md">
            <UserPlus size={15} />
            Add
          </Button>
        </div>

        {/* Traders List */}
        {traders.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-sm">
            No traders tracked yet. Add a wallet address above.
          </div>
        ) : (
          <div className="space-y-2">
            {traders.map((trader) => (
              <div
                key={trader.id}
                className={cn(
                  'flex items-center justify-between gap-3 p-3 rounded-xl border transition-colors',
                  trader.active
                    ? 'bg-slate-800/40 border-white/[0.06]'
                    : 'bg-slate-900/30 border-white/[0.03] opacity-60'
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full flex-shrink-0',
                      trader.active ? 'bg-emerald-500' : 'bg-slate-600'
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-slate-300 truncate">
                      {trader.walletAddress.slice(0, 10)}...{trader.walletAddress.slice(-6)}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {trader.active ? 'Active' : 'Paused'} ·{' '}
                      {new Date(trader.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => copyAddress(trader.walletAddress)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors"
                    title="Copy address"
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    onClick={() => toggleTrader(trader.id, trader.active)}
                    disabled={togglingId === trader.id}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
                    title={trader.active ? 'Pause' : 'Activate'}
                  >
                    {trader.active ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                  </button>
                  <button
                    onClick={() => removeTrader(trader.id)}
                    disabled={deletingId === trader.id}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Remove"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
