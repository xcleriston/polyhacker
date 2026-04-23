'use client';

import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

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

interface RecentTradesTableProps {
  trades: Trade[];
}

export function RecentTradesTable({ trades }: RecentTradesTableProps) {
  if (trades.length === 0) {
    return (
      <div className="text-center py-10 text-slate-500 text-sm">
        No recent trades. Add traders to start copying.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            {['Side', 'Market', 'Size', 'Price', 'Type', 'Status', 'Time'].map((h) => (
              <th
                key={h}
                className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider first:rounded-tl-lg last:rounded-tr-lg"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {trades.map((trade) => (
            <tr key={trade.id} className="hover:bg-white/[0.02] transition-colors">
              <td className="px-4 py-3">
                <div className="flex items-center gap-1.5">
                  {trade.side === 'BUY' ? (
                    <TrendingUp size={13} className="text-emerald-400" />
                  ) : (
                    <TrendingDown size={13} className="text-red-400" />
                  )}
                  <span
                    className={cn(
                      'text-xs font-semibold',
                      trade.side === 'BUY' ? 'text-emerald-400' : 'text-red-400'
                    )}
                  >
                    {trade.side}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 text-slate-300 max-w-[180px] truncate">
                {trade.market || `${trade.asset.slice(0, 8)}...`}
              </td>
              <td className="px-4 py-3 text-slate-200 font-mono">
                ${trade.usdcSize.toFixed(2)}
              </td>
              <td className="px-4 py-3 text-slate-400 font-mono">
                {trade.price.toFixed(4)}
              </td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-md text-[10px] font-medium border',
                    trade.orderType === 'LIMIT'
                      ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                      : 'bg-slate-700/50 border-white/10 text-slate-400'
                  )}
                >
                  {trade.orderType}
                </span>
              </td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-md text-[10px] font-medium border',
                    trade.status === 'FILLED'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : trade.status === 'FAILED'
                      ? 'bg-red-500/10 border-red-500/20 text-red-400'
                      : 'bg-slate-700/50 border-white/10 text-slate-400'
                  )}
                >
                  {trade.status}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                {new Date(trade.createdAt).toLocaleTimeString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

