import { Client } from 'pg';
import { ENV } from '../config/env';

export async function waitForDatabaseConfig() {
    console.log('🔄 Checking database for bot configurations...');

    while (true) {
        let client: Client | null = null;
        try {
            if (!process.env.DATABASE_URL) {
                console.error('❌ No DATABASE_URL found in environment variables!');
                await new Promise(resolve => setTimeout(resolve, 10000));
                continue;
            }

            client = new Client({ connectionString: process.env.DATABASE_URL });
            await client.connect();

            const res = await client.query('SELECT * FROM "Settings" LIMIT 1');
            const settings = res.rows[0];

            if (settings && settings.privateKey && settings.privateKey.length === 64) {
                // Update global ENV with database settings
                ENV.PRIVATE_KEY = settings.privateKey;
                ENV.PROXY_WALLET = settings.proxyWallet || '';
                
                // Also update other parameters
                if (settings.copyMode === 'MIRROR') {
                    ENV.COPY_STRATEGY_CONFIG.strategy = 'MIRROR' as any;
                }
                ENV.COPY_STRATEGY_CONFIG.copySize = settings.copySize;
                
                // Telegram setting
                if (settings.telegramChatId) {
                    ENV.TELEGRAM_CHAT_ID = settings.telegramChatId;
                }
                
                console.log('✅ Configuration loaded from Database successfully.');
                await client.end();
                return settings;
            } else {
                console.log('⏳ Waiting for valid configuration in the Web Dashboard...');
            }
        } catch (error) {
            console.error('❌ Database connection error while fetching settings:', error);
        } finally {
            if (client) {
                try {
                    await client.end();
                } catch (e) {
                    // ignore
                }
            }
        }
        
        // Wait 10 seconds before polling again
        await new Promise(resolve => setTimeout(resolve, 10000));
    }
}

export async function fetchTargetTraders() {
    let client: Client | null = null;
    try {
        if (!process.env.DATABASE_URL) return ENV.USER_ADDRESSES;

        client = new Client({ connectionString: process.env.DATABASE_URL });
        await client.connect();

        const res = await client.query('SELECT "walletAddress" FROM "Trader" WHERE "active" = true');
        const addresses = res.rows.map((row: any) => row.walletAddress.toLowerCase());
        
        // Update global ENV
        if (addresses.length > 0) {
            ENV.USER_ADDRESSES = addresses;
        }
        return addresses;
    } catch (error) {
        console.error('Failed to fetch traders from DB', error);
        return ENV.USER_ADDRESSES;
    } finally {
        if (client) {
            try {
                await client.end();
            } catch (e) {
                // ignore
            }
        }
    }
}
