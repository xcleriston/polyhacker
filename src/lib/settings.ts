import { Pool } from 'pg';
import { ENV } from '@/lib/config/env';

// Database connection pool for performance and resilience
let pool: Pool | null = null;

const getPool = () => {
    if (!pool) {
        if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL is not defined');
        }
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            max: 5, // Limit connections in multi-tenant environment
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });
    }
    return pool;
};

export interface Tenant {
    userId: string;
    name: string | null;
    privateKey: string;
    proxyWallet: string;
    settings: {
        copyMode: string;
        mirrorSizeMode: string;
        fixedAmount: number;
        copySize: number;
        dailyLossCapPct: number;
        testMode: boolean;
        botEnabled: boolean;
    };
    targetTraders: string[];
}

export let ACTIVE_TENANTS: Tenant[] = [];
export let GLOBAL_TARGET_TRADERS: string[] = [];

let syncInterval: NodeJS.Timeout | null = null;

export async function syncDatabase() {
    try {
        const pool = getPool();
        
        const query = `
            SELECT 
                u.id as "userId", u.name, 
                s."privateKey", s."proxyWallet", s."copyMode", s."mirrorSizeMode", 
                s."fixedAmount", s."copySize", s."dailyLossCapPct", s."testMode", s."botEnabled",
                COALESCE(
                    (SELECT json_agg(t."walletAddress") 
                     FROM "Trader" t 
                     WHERE t."userId" = u.id AND t."active" = true), 
                    '[]'::json
                ) as "traders"
            FROM "User" u
            INNER JOIN "Settings" s ON u.id = s."userId"
            WHERE u.active = true;
        `;
        
        const res = await pool.query(query);
        const newTenants: Tenant[] = [];
        const uniqueTraders = new Set<string>();

        for (const row of res.rows) {
            if (row.privateKey && row.privateKey.length === 64) {
                const targetTraders = (row.traders || []).map((t: string) => t.toLowerCase());
                newTenants.push({
                    userId: row.userId,
                    name: row.name,
                    privateKey: row.privateKey,
                    proxyWallet: row.proxyWallet || '',
                    targetTraders,
                    settings: {
                        copyMode: row.copyMode,
                        mirrorSizeMode: row.mirrorSizeMode,
                        fixedAmount: row.fixedAmount,
                        copySize: row.copySize,
                        dailyLossCapPct: row.dailyLossCapPct,
                        testMode: row.testMode !== false,
                        botEnabled: row.botEnabled === true,
                    }
                });
                targetTraders.forEach((t: string) => uniqueTraders.add(t));
            }
        }

        ACTIVE_TENANTS = newTenants;
        GLOBAL_TARGET_TRADERS = Array.from(uniqueTraders);

        console.log(`[Sync] Active Tenants: ${ACTIVE_TENANTS.map(t => `${t.name || t.userId} (${t.targetTraders.length} traders)`).join(', ')}`);
        console.log(`[Sync] Global Traders: ${GLOBAL_TARGET_TRADERS.join(', ')}`);

        // For backward compatibility with modules expecting ENV to be populated
        if (GLOBAL_TARGET_TRADERS.length > 0) {
            ENV.USER_ADDRESSES = GLOBAL_TARGET_TRADERS;
        }

        return newTenants.length > 0;
    } catch (error) {
        console.error('❌ Database sync error:', error instanceof Error ? error.message : String(error));
        return false;
    }
}

export async function waitForDatabaseConfig() {
    console.log('🔄 Checking database for bot configurations...');

    while (true) {
        const hasValidTenants = await syncDatabase();
        
        if (hasValidTenants) {
            console.log(`✅ Multi-Tenant Sync: Loaded ${ACTIVE_TENANTS.length} active users and ${GLOBAL_TARGET_TRADERS.length} unique traders.`);
            
            // Start the background sync loop (every 10 seconds)
            if (!syncInterval) {
                syncInterval = setInterval(() => {
                    syncDatabase().catch(() => {});
                }, 1000);
            }
            return true;
        } else {
            console.log('⏳ Waiting for valid user configurations in the Web Dashboard...');
        }
        
        // Wait 10 seconds before polling again
        await new Promise(resolve => setTimeout(resolve, 10000));
    }
}

export async function fetchTargetTraders() {
    // Legacy function, now handled by syncDatabase
    return GLOBAL_TARGET_TRADERS.length > 0 ? GLOBAL_TARGET_TRADERS : ENV.USER_ADDRESSES;
}

