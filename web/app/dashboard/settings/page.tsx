'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/components/providers/AuthProvider';
import { Settings, Save, AlertCircle, Loader2, FlaskConical, ShieldAlert } from 'lucide-react';

export default function SettingsPage() {
  const { user, token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    copyMode: 'NORMAL',
    mirrorSizeMode: 'PERCENTAGE',
    fixedAmount: '10.0',
    copySize: '10.0',
    proxyWallet: '',
    privateKey: '',
    dailyLossCapPct: '20.0',
    telegramChatId: '',
    testMode: true,
  });

  useEffect(() => {
    if (token) {
      fetchSettings();
    }
  }, [token]);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFormData({
          copyMode: data.copyMode || 'NORMAL',
          mirrorSizeMode: data.mirrorSizeMode || 'PERCENTAGE',
          fixedAmount: data.fixedAmount?.toString() || '10.0',
          copySize: data.copySize?.toString() || '10.0',
          proxyWallet: data.proxyWallet || '',
          privateKey: data.privateKey || '',
          dailyLossCapPct: data.dailyLossCapPct?.toString() || '20.0',
          telegramChatId: data.telegramChatId || '',
          testMode: data.testMode !== false, // default true
        });
      }
    } catch (err) {
      console.error('Failed to load settings', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setSuccess(false);
    setError('');
  };

  const handleToggleTestMode = () => {
    setFormData(prev => ({ ...prev, testMode: !prev.testMode }));
    setSuccess(false);
    setError('');
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess(false);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save settings');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl pb-12">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-violet-400" />
          Bot Settings
        </h1>
        <p className="text-slate-500 text-sm mt-1">Configure your copy trading parameters and wallet.</p>
      </div>

      {/* Test Mode Banner */}
      <div
        onClick={handleToggleTestMode}
        className={`cursor-pointer rounded-xl border p-4 flex items-start gap-4 transition-all duration-300 select-none ${
          formData.testMode
            ? 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/15'
            : 'bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/15'
        }`}
      >
        <div className={`mt-0.5 rounded-lg p-2 ${formData.testMode ? 'bg-amber-500/20' : 'bg-emerald-500/20'}`}>
          {formData.testMode
            ? <FlaskConical className="w-5 h-5 text-amber-400" />
            : <ShieldAlert className="w-5 h-5 text-emerald-400" />
          }
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <p className={`font-semibold text-sm ${formData.testMode ? 'text-amber-300' : 'text-emerald-300'}`}>
              {formData.testMode ? '🧪 Test Mode — ACTIVE (Paper Trading)' : '⚡ Live Mode — ACTIVE (Real Funds)'}
            </p>
            {/* Toggle pill */}
            <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 ${formData.testMode ? 'bg-amber-500' : 'bg-emerald-500'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-300 ${formData.testMode ? 'translate-x-1' : 'translate-x-6'}`} />
            </div>
          </div>
          <p className="text-xs mt-1 text-slate-400">
            {formData.testMode
              ? 'Trades are detected and logged but NOT executed. No real funds are used. Click to switch to Live Mode.'
              : 'Real trades will be submitted to Polymarket. Click to revert to safe Test Mode.'}
          </p>
        </div>
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

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Wallet Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Proxy Wallet Address</label>
            <Input
              name="proxyWallet"
              value={formData.proxyWallet}
              onChange={handleChange}
              placeholder="0x..."
            />
            <p className="text-xs text-slate-500">Your Polygon wallet address used for executing trades.</p>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Private Key</label>
            <Input
              name="privateKey"
              type="password"
              value={formData.privateKey}
              onChange={handleChange}
              placeholder="64 hex characters (without 0x)"
            />
            <p className="text-xs text-slate-500">Required for the bot to sign transactions. Never share this with anyone.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Trading Parameters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Copy Mode</label>
              <select
                name="copyMode"
                value={formData.copyMode}
                onChange={handleChange}
                className="w-full h-10 px-3 rounded-md border border-slate-700 bg-slate-800 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="NORMAL">NORMAL</option>
                <option value="MIRROR">MIRROR</option>
              </select>
              <p className="text-[10px] text-slate-500">Mirror bypasses filters.</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Size Mode</label>
              <select
                name="mirrorSizeMode"
                value={formData.mirrorSizeMode}
                onChange={handleChange}
                className="w-full h-10 px-3 rounded-md border border-slate-700 bg-slate-800 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="PERCENTAGE">PERCENTAGE</option>
                <option value="FIXED">FIXED</option>
                <option value="ADAPTIVE">ADAPTIVE</option>
              </select>
              <p className="text-[10px] text-slate-500">How to calculate position sizes.</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Fixed Amount (USD)</label>
              <Input
                name="fixedAmount"
                type="number"
                step="0.1"
                value={formData.fixedAmount}
                onChange={handleChange}
              />
              <p className="text-[10px] text-slate-500">Only used if Size Mode is FIXED.</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Copy Size (%)</label>
              <Input
                name="copySize"
                type="number"
                step="0.1"
                value={formData.copySize}
                onChange={handleChange}
              />
              <p className="text-[10px] text-slate-500">Percent of target's balance to copy.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Risk Management &amp; Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Daily Loss Cap (%)</label>
            <Input
              name="dailyLossCapPct"
              type="number"
              step="1"
              value={formData.dailyLossCapPct}
              onChange={handleChange}
            />
            <p className="text-xs text-slate-500">Kill switch threshold. Bot stops if daily losses exceed this.</p>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Telegram Chat ID</label>
            <Input
              name="telegramChatId"
              value={formData.telegramChatId}
              onChange={handleChange}
              placeholder="Ex: 123456789"
            />
            <p className="text-xs text-slate-500">
              {formData.telegramChatId 
                ? '✅ Bot vinculado. Você receberá notificações aqui.' 
                : 'Para vincular, envie `/vincular ' + user?.email + '` para o bot @polyhacker_bot.'}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end items-center gap-4">
        {success && <span className="text-emerald-400 text-sm">✓ Settings saved successfully!</span>}
        <Button onClick={handleSave} disabled={saving} className="bg-violet-600 hover:bg-violet-700 w-32">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-2" />Save</>}
        </Button>
      </div>
    </div>
  );
}
