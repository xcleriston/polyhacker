import { ClobClient } from '@polymarket/clob-client';
import { UserActivityInterface, UserPositionInterface } from '../interfaces/User';
import { ENV } from '../config/env';
import { getUserActivityModel } from '../models/userHistory';
import fetchData from '../utils/fetchData';
import getMyBalance from '../utils/getMyBalance';
import postOrder from '../utils/postOrder';
import Logger from '../utils/logger';
import telegram from '../utils/telegram';
import { CopyMode, calculateMirrorSize } from '../config/mirrorMode';
import { ACTIVE_TENANTS, Tenant } from '../utils/settings';
import createClobClient from '../utils/createClobClient';

const TRADE_AGGREGATION_MIN_TOTAL_USD = 1.0; // Polymarket minimum
// testMode is now per-tenant, stored in the database and configurable per user in the dashboard.

// Cache for ClobClients per tenant
const clobClients = new Map<string, ClobClient>();

const getClobClientForTenant = async (tenant: Tenant): Promise<ClobClient> => {
    if (!clobClients.has(tenant.userId)) {
        Logger.info(`[Multi-Tenant] Initializing CLOB Client for user ${tenant.name || tenant.userId}`);
        const client = await createClobClient(tenant.privateKey, tenant.proxyWallet);
        clobClients.set(tenant.userId, client);
    }
    return clobClients.get(tenant.userId)!;
};

// Daily loss tracking per tenant
const dailyStartBalances = new Map<string, number>();
const dailyStartDates = new Map<string, string>();
const killSwitches = new Map<string, boolean>();

const checkDailyLoss = async (tenant: Tenant): Promise<boolean> => {
    // MIRROR mode: skip kill-switch
    if (tenant.settings.copyMode === 'MIRROR') return true;

    const today = new Date().toISOString().split('T')[0];
    const currentBalance = await getMyBalance(tenant.proxyWallet);
    const userId = tenant.userId;

    if (dailyStartDates.get(userId) !== today) {
        dailyStartDates.set(userId, today);
        dailyStartBalances.set(userId, currentBalance);
        Logger.info(`📅 [${tenant.name || userId}] Daily balance reset: $${currentBalance.toFixed(2)}`);
    }

    const startBalance = dailyStartBalances.get(userId);
    if (startBalance !== undefined && startBalance !== null && startBalance > 0) {
        const lossPct = ((startBalance - currentBalance) / startBalance) * 100;
        const capPct = tenant.settings.dailyLossCapPct || 20.0;
        
        if (lossPct >= capPct) {
            if (!killSwitches.get(userId)) {
                Logger.error(`🛑 [${tenant.name || userId}] KILL SWITCH: Daily loss ${lossPct.toFixed(1)}% exceeds ${capPct}% cap. Trading halted.`);
                killSwitches.set(userId, true);
                telegram.killSwitch(lossPct, tenant.settings.telegramChatId);
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

// Buffer for aggregating trades (per tenant)
const tradeAggregationBuffers = new Map<string, Map<string, AggregatedTrade>>();

const getBufferForTenant = (userId: string) => {
    if (!tradeAggregationBuffers.has(userId)) {
        tradeAggregationBuffers.set(userId, new Map());
    }
    return tradeAggregationBuffers.get(userId)!;
};

const readTempTradesForTenant = async (tenant: Tenant): Promise<TradeWithUser[]> => {
    const allTrades: TradeWithUser[] = [];

    for (const address of tenant.targetTraders) {
        const model = getUserActivityModel(address);
        const trades = await model
            .find({
                $and: [
                    { type: 'TRADE' },
                    { executedBy: { $ne: tenant.userId } }
                ],
            })
            .exec();

        const tradesWithUser = trades.map((trade) => ({
            ...(trade.toObject() as UserActivityInterface),
            userAddress: address,
        }));

        allTrades.push(...tradesWithUser);
    }

    return allTrades;
};

const getAggregationKey = (trade: TradeWithUser): string => {
    return `${trade.userAddress}:${trade.conditionId}:${trade.asset}:${trade.side}`;
};

const addToAggregationBuffer = (tenant: Tenant, trade: TradeWithUser): void => {
    const buffer = getBufferForTenant(tenant.userId);
    const key = getAggregationKey(trade);
    const existing = buffer.get(key);
    const now = Date.now();

    if (existing) {
        existing.trades.push(trade);
        existing.totalUsdcSize += trade.usdcSize;
        const totalValue = existing.trades.reduce((sum, t) => sum + t.usdcSize * t.price, 0);
        existing.averagePrice = totalValue / existing.totalUsdcSize;
        existing.lastTradeTime = now;
    } else {
        buffer.set(key, {
            userAddress: trade.userAddress,
            conditionId: trade.conditionId,
            asset: trade.asset,
            side: trade.side || 'BUY',
            slug: trade.slug,
            eventSlug: trade.eventSlug,
            trades: [trade],
            totalUsdcSize: trade.usdcSize,
            averagePrice: trade.price,
            firstTradeTime: now,
            lastTradeTime: now,
        });
    }
};

const getReadyAggregatedTrades = (tenant: Tenant): AggregatedTrade[] => {
    const ready: AggregatedTrade[] = [];
    const now = Date.now();
    const windowMs = ENV.TRADE_AGGREGATION_WINDOW_SECONDS * 1000;
    const buffer = getBufferForTenant(tenant.userId);

    for (const [key, agg] of buffer.entries()) {
        const timeElapsed = now - agg.firstTradeTime;

        if (timeElapsed >= windowMs) {
            if (agg.totalUsdcSize >= TRADE_AGGREGATION_MIN_TOTAL_USD) {
                ready.push(agg);
            } else {
                Logger.info(
                    `[${tenant.name || tenant.userId}] Trade aggregation for ${agg.userAddress} on ${agg.slug || agg.asset}: $${agg.totalUsdcSize.toFixed(2)} total from ${agg.trades.length} trades below minimum ($${TRADE_AGGREGATION_MIN_TOTAL_USD}) - skipping`
                );

                for (const trade of agg.trades) {
                    const UserActivity = getUserActivityModel(trade.userAddress);
                    UserActivity.updateOne({ _id: trade._id }, { $push: { executedBy: tenant.userId } }).exec();
                }
            }
            buffer.delete(key);
        }
    }

    return ready;
};

const markTradeExecuted = async (tenantId: string, trade: TradeWithUser) => {
    const UserActivity = getUserActivityModel(trade.userAddress);
    await UserActivity.updateOne({ _id: trade._id }, { $push: { executedBy: tenantId } });
};

const doMirrorTrading = async (tenant: Tenant, clobClient: ClobClient, trades: TradeWithUser[]) => {
    for (const trade of trades) {
        await markTradeExecuted(tenant.userId, trade);

        const orderType = trade.orderType ?? 'MARKET';
        Logger.info(
            `[TRADE DETECTED] MIRROR | Tenant: ${tenant.name || tenant.userId} | ${trade.userAddress.slice(0, 6)}... | ${orderType} | size=$${trade.usdcSize} price=${trade.price}`
        );

        if (tenant.settings.testMode) {
            Logger.info(`🧪 [${tenant.name || tenant.userId}] TEST MODE — MIRROR trade detected but NOT executed (enable Live Mode in Settings)`);
            Logger.separator();
            continue;
        }

        const my_positions: UserPositionInterface[] = await fetchData(
            `https://data-api.polymarket.com/positions?user=${tenant.proxyWallet}`
        );
        const user_positions: UserPositionInterface[] = await fetchData(
            `https://data-api.polymarket.com/positions?user=${trade.userAddress}`
        );
        const my_position = my_positions.find(
            (position: UserPositionInterface) => position.conditionId === trade.conditionId
        );
        const user_position = user_positions.find(
            (position: UserPositionInterface) => position.conditionId === trade.conditionId
        );

        const my_balance = await getMyBalance(tenant.proxyWallet);
        const user_balance = user_positions.reduce((total, pos) => total + (pos.currentValue || 0), 0);
        const recentPnl = user_positions.length > 0 ? user_positions.reduce((sum, p) => sum + (p.percentPnl || 0), 0) / user_positions.length : 0;

        const mirrorConfig = {
            copyMode: CopyMode.MIRROR,
            mirrorSizeMode: tenant.settings.mirrorSizeMode as any,
            copySize: tenant.settings.copySize,
            fixedAmount: tenant.settings.fixedAmount
        };

        const mirroredSize = calculateMirrorSize(mirrorConfig, trade.usdcSize, my_balance, user_balance, recentPnl);

        const mirroredTrade: UserActivityInterface = {
            ...trade,
            usdcSize: mirroredSize,
        };

        Logger.info(`[TRADE EXECUTED] MIRROR | ${orderType} | side=${trade.side} size=$${mirroredSize.toFixed(2)} price=${trade.price}`);

        await postOrder(
            clobClient,
            trade.side === 'BUY' ? 'buy' : 'sell',
            my_position,
            user_position,
            mirroredTrade,
            my_balance,
            trade.userAddress
        );

        telegram.tradeExecuted(trade.side || 'BUY', mirroredSize, trade.price || 0, trade.slug || trade.asset, tenant.settings.telegramChatId);
        Logger.separator();
    }
};

const doTrading = async (tenant: Tenant, clobClient: ClobClient, trades: TradeWithUser[]) => {
    for (const trade of trades) {
        if (killSwitches.get(tenant.userId)) {
            Logger.warning(`🛑 Kill switch active for ${tenant.name || tenant.userId} — skipping trade`);
            return;
        }
        if (!(await checkDailyLoss(tenant))) return;

        await markTradeExecuted(tenant.userId, trade);

        Logger.trade(trade.userAddress, trade.side || 'UNKNOWN', {
            asset: trade.asset,
            side: trade.side,
            amount: trade.usdcSize,
            price: trade.price,
            slug: trade.slug,
            eventSlug: trade.eventSlug,
            transactionHash: trade.transactionHash,
        });

        if (tenant.settings.testMode) {
            Logger.info(`🧪 [${tenant.name || tenant.userId}] TEST MODE — trade detected but NOT executed (enable Live Mode in Settings)`);
            Logger.separator();
            continue;
        }

        const my_positions: UserPositionInterface[] = await fetchData(
            `https://data-api.polymarket.com/positions?user=${tenant.proxyWallet}`
        );
        const user_positions: UserPositionInterface[] = await fetchData(
            `https://data-api.polymarket.com/positions?user=${trade.userAddress}`
        );
        const my_position = my_positions.find(
            (position: UserPositionInterface) => position.conditionId === trade.conditionId
        );
        const user_position = user_positions.find(
            (position: UserPositionInterface) => position.conditionId === trade.conditionId
        );

        const my_balance = await getMyBalance(tenant.proxyWallet);
        const user_balance = user_positions.reduce((total, pos) => total + (pos.currentValue || 0), 0);

        Logger.balance(my_balance, user_balance, trade.userAddress);

        await postOrder(
            clobClient,
            trade.side === 'BUY' ? 'buy' : 'sell',
            my_position,
            user_position,
            trade,
            my_balance,
            trade.userAddress
        );

        telegram.tradeExecuted(trade.side || 'BUY', trade.usdcSize, trade.price || 0, trade.slug || trade.asset, tenant.settings.telegramChatId);
        Logger.separator();
    }
};

const doAggregatedTrading = async (tenant: Tenant, clobClient: ClobClient, aggregatedTrades: AggregatedTrade[]) => {
    for (const agg of aggregatedTrades) {
        Logger.header(`📊 AGGREGATED TRADE for ${tenant.name || tenant.userId} (${agg.trades.length} trades combined)`);
        Logger.info(`Market: ${agg.slug || agg.asset}`);
        Logger.info(`Side: ${agg.side}`);
        Logger.info(`Total volume: $${agg.totalUsdcSize.toFixed(2)}`);
        Logger.info(`Average price: $${agg.averagePrice.toFixed(4)}`);

        for (const trade of agg.trades) {
            await markTradeExecuted(tenant.userId, trade);
        }

        if (tenant.settings.testMode) {
            Logger.info(`🧪 [${tenant.name || tenant.userId}] TEST MODE — aggregated trade detected but NOT executed (enable Live Mode in Settings)`);
            Logger.separator();
            continue;
        }

        const my_positions: UserPositionInterface[] = await fetchData(
            `https://data-api.polymarket.com/positions?user=${tenant.proxyWallet}`
        );
        const user_positions: UserPositionInterface[] = await fetchData(
            `https://data-api.polymarket.com/positions?user=${agg.userAddress}`
        );
        const my_position = my_positions.find(
            (position: UserPositionInterface) => position.conditionId === agg.conditionId
        );
        const user_position = user_positions.find(
            (position: UserPositionInterface) => position.conditionId === agg.conditionId
        );

        const my_balance = await getMyBalance(tenant.proxyWallet);
        const user_balance = user_positions.reduce((total, pos) => total + (pos.currentValue || 0), 0);

        Logger.balance(my_balance, user_balance, agg.userAddress);

        const syntheticTrade: UserActivityInterface = {
            ...agg.trades[0],
            usdcSize: agg.totalUsdcSize,
            price: agg.averagePrice,
            side: agg.side as 'BUY' | 'SELL',
        };

        await postOrder(
            clobClient,
            agg.side === 'BUY' ? 'buy' : 'sell',
            my_position,
            user_position,
            syntheticTrade,
            my_balance,
            agg.userAddress
        );

        telegram.tradeExecuted(agg.side || 'BUY', agg.totalUsdcSize, agg.averagePrice || 0, agg.slug || agg.asset, tenant.settings.telegramChatId);
        Logger.separator();
    }
};

let isRunning = true;

export const stopTradeExecutor = () => {
    isRunning = false;
    Logger.info('Multi-Tenant Trade executor shutdown requested...');
};

const tradeExecutor = async () => {
    Logger.success(`Multi-Tenant Trade executor ready`);
    
    let lastCheck = Date.now();

    while (isRunning) {
        for (const tenant of ACTIVE_TENANTS) {
            if (!tenant.settings.botEnabled) continue;
            if (!tenant.targetTraders.length) continue;

            const trades = await readTempTradesForTenant(tenant);
            if (trades.length === 0) continue; // Skip to next tenant if no trades

            const clobClient = await getClobClientForTenant(tenant);

            if (tenant.settings.copyMode === 'MIRROR') {
                Logger.clearLine();
                await doMirrorTrading(tenant, clobClient, trades);
                lastCheck = Date.now();
            } else if (ENV.TRADE_AGGREGATION_ENABLED) {
                Logger.clearLine();
                Logger.info(`📥 ${trades.length} new trade(s) detected for ${tenant.name || tenant.userId}`);

                for (const trade of trades) {
                    if (trade.side === 'BUY' && trade.usdcSize < TRADE_AGGREGATION_MIN_TOTAL_USD) {
                        Logger.info(`Adding $${trade.usdcSize.toFixed(2)} ${trade.side} trade to aggregation buffer for ${trade.slug || trade.asset}`);
                        addToAggregationBuffer(tenant, trade);
                    } else {
                        Logger.clearLine();
                        Logger.header('⚡ IMMEDIATE TRADE (above threshold)');
                        await doTrading(tenant, clobClient, [trade]);
                    }
                }
                lastCheck = Date.now();
            } else {
                Logger.clearLine();
                Logger.header(`⚡ ${trades.length} NEW TRADE(S) TO COPY FOR ${tenant.name || tenant.userId}`);
                await doTrading(tenant, clobClient, trades);
                lastCheck = Date.now();
            }
        }

        // Process aggregations for all tenants
        for (const tenant of ACTIVE_TENANTS) {
            if (!tenant.settings.botEnabled) continue;
            const readyAggregations = getReadyAggregatedTrades(tenant);
            if (readyAggregations.length > 0) {
                const clobClient = await getClobClientForTenant(tenant);
                Logger.clearLine();
                Logger.header(`⚡ ${readyAggregations.length} AGGREGATED TRADE(S) READY FOR ${tenant.name || tenant.userId}`);
                await doAggregatedTrading(tenant, clobClient, readyAggregations);
                lastCheck = Date.now();
            }
        }

        if (Date.now() - lastCheck > 3000) { // Log waiting every 3s instead of hammering
            let totalWaiting = 0;
            for (const buffer of tradeAggregationBuffers.values()) {
                totalWaiting += buffer.size;
            }
            if (totalWaiting > 0) {
                Logger.waiting(ACTIVE_TENANTS.length, `${totalWaiting} trade group(s) pending across all tenants`);
            } else {
                Logger.waiting(ACTIVE_TENANTS.length, 'SaaS Engine Active');
            }
            lastCheck = Date.now();
        }

        if (!isRunning) break;
        await new Promise((resolve) => setTimeout(resolve, 300));
    }

    Logger.info('Multi-Tenant Trade executor stopped');
};

export default tradeExecutor;
