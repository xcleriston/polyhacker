import axios from 'axios';
import { ENV } from '../config/env';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const isEnabled = (chatId?: string): boolean => !!TELEGRAM_BOT_TOKEN && !!(chatId || ENV.TELEGRAM_CHAT_ID);

const send = async (message: string, _chatId?: string): Promise<void> => {
  if (!isEnabled()) return;
  const targetChatId = ENV.TELEGRAM_CHAT_ID;
  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      { chat_id: targetChatId, text: message, parse_mode: 'Markdown' },
      { timeout: 5000 }
    );
  } catch {
    // Silently fail to avoid disrupting trading
  }
};

const telegram = {
  isEnabled,
  send,
  tradeExecuted: (side: string, amount: number, price: number, market: string, chatId?: string) =>
    send(`✅ *[Poly Hacker Bot] ${side}* $${amount.toFixed(2)} @ $${price.toFixed(4)}\n📊 ${market}`, chatId),
  killSwitch: (lossPct: number, chatId?: string) =>
    send(`🛑 *[Poly Hacker Bot] KILL SWITCH TRIGGERED*\nDaily loss: ${lossPct.toFixed(1)}%\nTrading halted.`, chatId),
  error: (msg: string, chatId?: string) =>
    send(`❌ *[Poly Hacker Bot] Error*: ${msg}`, chatId),
  startup: (traderCount: number, balance: number, chatId?: string) =>
    send(`🚀 *[Poly Hacker Bot] Started*\nTracking ${traderCount} trader(s)\nBalance: $${balance.toFixed(2)}`, chatId),
  status: (traderCount: number, mode: string, chatId?: string) =>
    send(`📊 *[Poly Hacker Bot] Status*\nMode: ${mode}\nTrading ${traderCount} trader(s)`, chatId),
  traders: (addresses: string[], chatId?: string) =>
    send(
      `👥 *[Poly Hacker Bot] Tracked Traders* (${addresses.length})\n` +
        addresses.map((a, i) => `${i + 1}. \`${a.slice(0, 8)}...${a.slice(-6)}\``).join('\n'),
      chatId
    ),
};

export default telegram;
