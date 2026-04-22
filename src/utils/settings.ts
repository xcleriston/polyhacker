import { PrismaClient } from '@prisma/client';
import { ENV } from '../config/env';

const prisma = new PrismaClient();

export async function waitForDatabaseConfig() {
    let settings = null;
    console.log('🔄 Checking database for bot configurations...');

    while (true) {
        try {
            settings = await prisma.settings.findFirst();
            if (settings && settings.privateKey && settings.privateKey.length === 64) {
                // Update global ENV with database settings
                ENV.PRIVATE_KEY = settings.privateKey;
                ENV.PROXY_WALLET = settings.proxyWallet || '';
                
                // Also update other parameters
                if (settings.copyMode === 'MIRROR') {
                    ENV.COPY_STRATEGY_CONFIG.strategy = 'MIRROR' as any;
                }
                ENV.COPY_STRATEGY_CONFIG.copySize = settings.copySize;
                
                console.log('✅ Configuration loaded from Database successfully.');
                return settings;
            } else {
                console.log('⏳ Waiting for valid configuration in the Web Dashboard...');
            }
        } catch (error) {
            console.error('❌ Database connection error while fetching settings:', error);
        }
        
        // Wait 10 seconds before polling again
        await new Promise(resolve => setTimeout(resolve, 10000));
    }
}

export async function fetchTargetTraders() {
    try {
        const activeTraders = await prisma.trader.findMany({
            where: { active: true }
        });
        const addresses = activeTraders.map(t => t.walletAddress.toLowerCase());
        
        // Update global ENV
        if (addresses.length > 0) {
            ENV.USER_ADDRESSES = addresses;
        }
        return addresses;
    } catch (error) {
        console.error('Failed to fetch traders from DB', error);
        return ENV.USER_ADDRESSES;
    }
}
