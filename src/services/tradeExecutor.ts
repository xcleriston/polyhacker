import { ClobClient } from '@polymarket/clob-client';
import { UserActivityInterface, UserPositionInterface } from '@/lib/interfaces/User';
import { ENV } from '@/lib/config/env';
import { getUserActivityModel } from '@/lib/models/userHistory';
import fetchData from '@/lib/fetchData';
import getMyBalance from '@/polymarket/getMyBalance';
import postOrder from '@/polymarket/postOrder';
import Logger from '@/lib/logger';
import telegram from '@/lib/telegram';
import { CopyMode, calculateMirrorSize } from '@/lib/config/mirrorMode';
import { ACTIVE_TENANTS, Tenant } from '@/lib/settings';
import createClobClient from '@/polymarket/createClobClient';
import { AssetType } from '@polymarket/clob-client';
import { ethers } from 'ethers';

const TRADE_AGGREGATION_MIN_TOTAL_USD = 1.0;

// Cache for ClobClients per tenant
const clobClients = new Map<string, ClobClient>();
// Track proxy failures for Agent 10
const proxyFailures = new Map<string, number>();

const getClobClientForTenant = async (tenant: Tenant, forceEoa: boolean = false): Promise<ClobClient> => {
    const cacheKey = `${tenant.userId}:${forceEoa}`;
    if (!clobClients.has(cacheKey)) {
        Logger.info(`[Multi-Tenant] Initializing CLOB Client for user ${tenant.name || tenant.userId} ${forceEoa ? '(EOA Mode)' : ''}`);
        const funder = forceEoa ? undefined : tenant.proxyWallet;
        const client = await createClobClient(tenant.privateKey, funder);
        clobClients.set(cacheKey, client);
    }
    return clobClients.get(cacheKey)!;
};

const handleTradingError = async (tenant: Tenant, error: any) => {
    const userId = tenant.userId;
    const errorMessage = error.message || String(error);
    if (errorMessage.includes('INVALID_SIGNATURE') || errorMessage.includes('FUNDER_MISMATCH')) {
        const failures = (proxyFailures.get(userId) || 0) + 1;
        proxyFailures.set(userId, failures);
        if (failures >= 3) {
            Logger.error(`⚠️ [Agent 10] Consistently failing for ${tenant.name || userId}. SWITCHING TO EOA.`);
            return true;
        }
    }
    return false;
};

// Daily loss tracking
const dailyStartBalances = new Map<string, number>();
const dailyStartDates = new Map<string, string>();
const killSwitches = new Map<string, boolean>();

const checkDailyLoss = async (tenant: Tenant): Promise<boolean> => {
    if (tenant.settings.copyMode === 'MIRROR') return true;
    const today = new Date().toISOString().split('T')[0];
    const currentBalance = await getMyBalance(tenant.proxyWallet);
    const userId = tenant.userId;
    if (dailyStartDates.get(userId) !== today) {
        dailyStartDates.set(userId, today);
        dailyStartBalances.set(userId, currentBalance);
    }
    const startBalance = dailyStartBalances.get(userId);
    if (startBalance && startBalance > 0) {
        const lossPct = ((startBalance - currentBalance) / startBalance) * 100;
        const capPct = tenant.settings.dailyLossCapPct || 20.0;
        if (lossPct >= capPct) {
            if (!killSwitches.get(userId)) {
                Logger.error(`🛑 [${tenant.name || userId}] KILL SWITCH: Daily loss ${lossPct.toFixed(1)}% exceeds cap.`);
                killSwitches.set(userId, true);
                telegram.killSwitch(lossPct);
            }
            return false;
        }
    }
    return true;
};

interface TradeWithUser extends UserActivityInterface {
    userAddress: string;
}

interface AggregatedTrade {
    userAddress: string;
    conditionId: string;
    asset: string;
    side: string;
    slug?: string;
    eventSlug?: string;
    trades: TradeWithUser[];
    totalUsdcSize: number;
    averagePrice: number;
    firstTradeTime: number;
    lastTradeTime: number;
}

const tradeAggregationBuffers = new Map<string, Map<string, AggregatedTrade>>();
const getBufferForTenant = (userId: string) => {
    if (!tradeAggregationBuffers.has(userId)) tradeAggregationBuffers.set(userId, new Map());
    return tradeAggregationBuffers.get(userId)!;
};

const readTempTradesForTenant = async (tenant: Tenant): Promise<TradeWithUser[]> => {
    const allTrades: TradeWithUser[] = [];
    for (const address of tenant.targetTraders) {
        const model = getUserActivityModel(address);
        const trades = await model.find({ $and: [{ type: 'TRADE' }, { executedBy: { $ne: tenant.userId } }] }).exec();
        allTrades.push(...trades.map(t => ({ ...(t.toObject() as UserActivityInterface), userAddress: address })));
    }
    return allTrades;
};

const markTradeExecuted = async (tenantId: string, trade: TradeWithUser) => {
    const UserActivity = getUserActivityModel(trade.userAddress);
    await UserActivity.updateOne({ _id: trade._id }, { $push: { executedBy: tenantId } });
};

const doTrading = async (tenant: Tenant, clobClient: ClobClient, trades: TradeWithUser[], useEoa: boolean) => {
    for (const trade of trades) {
        if (killSwitches.get(tenant.userId)) continue;
        if (!(await checkDailyLoss(tenant))) continue;
        await markTradeExecuted(tenant.userId, trade);

        if (tenant.settings.testMode) {
            Logger.info(`🧪 [${tenant.name || tenant.userId}] TEST MODE detected`);
            continue;
        }

        try {
            const my_balance = await getMyBalance(useEoa ? '' : tenant.proxyWallet);
            await postOrder(clobClient, trade.side === 'BUY' ? 'buy' : 'sell', undefined, undefined, trade, my_balance, trade.userAddress, tenant.privateKey);
            telegram.tradeExecuted(trade.side || 'BUY', trade.usdcSize, trade.price || 0, trade.slug || trade.asset);
        } catch (err) {
            await handleTradingError(tenant, err);
        }
    }
};

let isRunning = true;

export const stopTradeExecutor = () => {
    isRunning = false;
    Logger.info('Trade executor shutdown requested...');
};

const tradeExecutor = async () => {
    Logger.success(`Polymarket Trading Engine Operational`);
    let lastCheck = Date.now();

    while (isRunning) {
        try {
            for (const tenant of ACTIVE_TENANTS) {
                try {
                    if (!tenant.settings.botEnabled) continue;
                    const trades = await readTempTradesForTenant(tenant);
                    if (trades.length === 0) continue;

                    const useEoa = (proxyFailures.get(tenant.userId) || 0) >= 3;
                    const clobClient = await getClobClientForTenant(tenant, useEoa);

                    // Agent 6: Approval
                    if (!tenant.settings.testMode) {
                        try {
                            const { allowance } = await clobClient.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
                            if (parseFloat(allowance) < 1000) await clobClient.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });
                            try { await (clobClient as any).updateIsApproved(true); } catch (e) {}
                        } catch (e) {}
                    }

                    await doTrading(tenant, clobClient, trades, useEoa);
                    lastCheck = Date.now();
                } catch (e) {}
            }
            if (Date.now() - lastCheck > 10000) {
                Logger.waiting(ACTIVE_TENANTS.length, 'Monitoring Trades');
                lastCheck = Date.now();
            }
        } catch (e) {
            await new Promise(r => setTimeout(r, 5000));
        }
        await new Promise(r => setTimeout(r, 1000));
    }
};

export default tradeExecutor;

