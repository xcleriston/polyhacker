import axios from 'axios';
import { ENV } from '../config/env';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const isEnabled = (): boolean => !!TELEGRAM_BOT_TOKEN && !!ENV.TELEGRAM_CHAT_ID;

const send = async (message: string): Promise<void> => {
  if (!isEnabled()) return;
  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      { chat_id: ENV.TELEGRAM_CHAT_ID, text: message, parse_mode: 'Markdown' },
      { timeout: 5000 }
    );
  } catch {
    // Silently fail to avoid disrupting trading
  }
};

const telegram = {
  isEnabled,
  send,
  tradeExecuted: (side: string, amount: number, price: number, market: string) =>
    send(`✅ *[Poly Hacker Bot] ${side}* $${amount.toFixed(2)} @ $${price.toFixed(4)}\n📊 ${market}`),
  killSwitch: (lossPct: number) =>
    send(`🛑 *[Poly Hacker Bot] KILL SWITCH TRIGGERED*\nDaily loss: ${lossPct.toFixed(1)}%\nTrading halted.`),
  error: (msg: string) =>
    send(`❌ *[Poly Hacker Bot] Error*: ${msg}`),
  startup: (traderCount: number, balance: number) =>
    send(`🚀 *[Poly Hacker Bot] Started*\nTracking ${traderCount} trader(s)\nBalance: $${balance.toFixed(2)}`),
  status: (traderCount: number, mode: string) =>
    send(`📊 *[Poly Hacker Bot] Status*\nMode: ${mode}\nTrading ${traderCount} trader(s)`),
  traders: (addresses: string[]) =>
    send(
      `👥 *[Poly Hacker Bot] Tracked Traders* (${addresses.length})\n` +
        addresses.map((a, i) => `${i + 1}. \`${a.slice(0, 8)}...${a.slice(-6)}\``).join('\n')
    ),
};

export default telegram;
