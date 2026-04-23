import { Telegraf } from 'telegraf';
import Logger from '@/lib/logger';
import { ACTIVE_TENANTS } from '@/lib/settings';
import { ENV } from '@/lib/config/env';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');

export const startTelegramBot = () => {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
        Logger.warning('TELEGRAM_BOT_TOKEN not found, bot listener disabled.');
        return;
    }

    const ADMIN_CHAT_ID = ENV.TELEGRAM_CHAT_ID;

    // Middleware to restrict to Admin only
    bot.use(async (ctx, next) => {
        if (ctx.chat?.id.toString() !== ADMIN_CHAT_ID) {
            return ctx.reply('⚠️ Este bot está configurado em modo restrito ao Administrador.');
        }
        return next();
    });

    bot.start((ctx) => {
        ctx.reply('🚀 *Poly Hacker Admin Bot*\n\nStatus: Online\nRegion: Amsterdam (EU)\n\nUse `/status` para ver o resumo do sistema.', { parse_mode: 'Markdown' });
    });

    bot.command('status', async (ctx) => {
        try {
            const activeCount = ACTIVE_TENANTS.filter((t: any) => t.settings.botEnabled).length;
            const totalTraders = ACTIVE_TENANTS.reduce((sum: number, t: any) => sum + t.targetTraders.length, 0);
            
            ctx.reply(`📊 *Sistema SaaS - Status Geral*\n\nUsuários Ativos: ${activeCount}\nTotal de Traders Monitorados: ${totalTraders}\n\nO bot está operando para todos os usuários com Live Mode ativo.`, { parse_mode: 'Markdown' });
        } catch (err) {
            Logger.error(`Telegram Status Error: ${err}`);
            ctx.reply('❌ Erro ao buscar status do sistema.');
        }
    });

    bot.launch()
        .then(() => Logger.success('Telegram Bot Listener started (polling)'))
        .catch(err => Logger.error(`Telegram Bot Error: ${err.message}`));

    // Enable graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
};

