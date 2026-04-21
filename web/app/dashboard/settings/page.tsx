'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useAuth } from '@/components/providers/AuthProvider';

export default function SettingsPage() {
  const { user } = useAuth();

  const envVars = [
    { key: 'COPY_MODE', desc: 'NORMAL or MIRROR — MIRROR bypasses all filters', default: 'NORMAL' },
    { key: 'MIRROR_SIZE_MODE', desc: 'PERCENTAGE | FIXED | ADAPTIVE', default: 'PERCENTAGE' },
    { key: 'FIXED_AMOUNT', desc: 'USD per trade (FIXED mode only)', default: '10.0' },
    { key: 'PROXY_WALLET', desc: 'Your Polygon wallet address', default: '' },
    { key: 'PRIVATE_KEY', desc: 'Wallet private key (no 0x prefix)', default: '' },
    { key: 'TELEGRAM_BOT_TOKEN', desc: 'Poly Hacker Bot token from @BotFather', default: '' },
    { key: 'TELEGRAM_CHAT_ID', desc: 'Your Telegram user/chat ID', default: '' },
    { key: 'DAILY_LOSS_CAP_PCT', desc: 'Kill switch threshold (%)', default: '20' },
    { key: 'DATABASE_URL', desc: 'PostgreSQL connection string', default: 'postgresql://...' },
    { key: 'JWT_SECRET', desc: 'Secret for signing JWT tokens', default: 'change-me' },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Configuration reference for the Poly Hacker engine</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-violet-600/30 border border-violet-500/30 flex items-center justify-center text-sm font-semibold text-violet-300">
              {user?.email?.[0]?.toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium text-white">{user?.email}</p>
              <p className="text-xs text-slate-500">Authenticated user</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Environment Variables</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-500 mb-4">
            Configure these in your <code className="text-violet-400">.env</code> file at the project root.
          </p>
          <div className="space-y-3">
            {envVars.map(({ key, desc, default: def }) => (
              <div key={key} className="p-3 rounded-xl bg-slate-800/40 border border-white/[0.05]">
                <div className="flex items-center justify-between gap-2">
                  <code className="text-xs font-mono text-violet-300">{key}</code>
                  {def && (
                    <span className="text-[10px] text-slate-500 font-mono bg-slate-700/50 px-2 py-0.5 rounded">
                      default: {def}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">{desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
