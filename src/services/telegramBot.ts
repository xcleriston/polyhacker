import { Telegraf } from 'telegraf';
import Logger from '../utils/logger';
import { ACTIVE_TENANTS } from '../utils/settings';
import { query } from '../utils/pg';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');

export const startTelegramBot = () => {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
        Logger.warning('TELEGRAM_BOT_TOKEN not found, bot listener disabled.');
        return;
    }

    bot.start((ctx) => {
        ctx.reply('🚀 *Poly Hacker Bot SaaS*\n\nPara receber notificações, vincule seu e-mail cadastrado usando o comando:\n\n`/vincular seu_email@exemplo.com`', { parse_mode: 'Markdown' });
    });

    bot.command('status', async (ctx) => {
        const chatId = ctx.chat.id.toString();
        
        try {
            // Find user settings by chatId
            const res = await query('SELECT s.*, u.email FROM "Settings" s JOIN "User" u ON s."userId" = u.id WHERE s."telegramChatId" = $1', [chatId]);
            const settings = res.rows[0];

            if (!settings) {
                return ctx.reply('❌ Conta não vinculada. Use `/vincular [seu_email]` para começar.');
            }

            const tenant = ACTIVE_TENANTS.find(t => t.userId === settings.userId);
            const status = tenant ? '✅ Ativo' : '❌ Inativo (Verifique Configurações)';
            const mode = settings.testMode ? '🧪 Test Mode' : '⚡ Live Mode';

            ctx.reply(`📊 *Status do seu Bot*\n\nUsuário: ${settings.email}\nStatus: ${status}\nModo: ${mode}\nTraders: ${tenant?.targetTraders.length || 0}`, { parse_mode: 'Markdown' });
        } catch (err) {
            Logger.error(`Telegram Status Error: ${err}`);
            ctx.reply('❌ Erro ao buscar status.');
        }
    });

    bot.command('vincular', async (ctx) => {
        const text = (ctx.message as any).text || '';
        const email = text.split(' ')[1]?.trim().toLowerCase();

        if (!email) {
            return ctx.reply('⚠️ Use: `/vincular seu_email@exemplo.com`');
        }

        try {
            const userRes = await query('SELECT id FROM "User" WHERE email = $1', [email]);
            const user = userRes.rows[0];

            if (!user) {
                return ctx.reply('❌ E-mail não encontrado no sistema.');
            }

            await query(`
                INSERT INTO "Settings" ("userId", "telegramChatId", "testMode")
                VALUES ($1, $2, true)
                ON CONFLICT ("userId") 
                DO UPDATE SET "telegramChatId" = $2
            `, [user.id, ctx.chat.id.toString()]);

            ctx.reply(`✅ Conta vinculada com sucesso ao e-mail: *${email}*`, { parse_mode: 'Markdown' });
        } catch (err) {
            Logger.error(`Telegram Bind Error: ${err}`);
            ctx.reply('❌ Erro ao vincular conta.');
        }
    });

    bot.launch()
        .then(() => Logger.success('Telegram Bot Listener started (polling)'))
        .catch(err => Logger.error(`Telegram Bot Error: ${err.message}`));

    // Enable graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
};
