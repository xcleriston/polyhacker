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

const TRADE_AGGREGATION_MIN_TOTAL_USD = 1.0; // Polymarket minimum
const PREVIEW_MODE = process.env.PREVIEW_MODE === 'true';

// Daily loss tracking — disabled in MIRROR mode
let dailyStartBalance: number | null = null;
let dailyStartDate = '';
let killSwitchTriggered = false;
const DAILY_LOSS_CAP_PCT = parseFloat(process.env.DAILY_LOSS_CAP_PCT || '20');

const checkDailyLoss = async (): Promise<boolean> => {
    // MIRROR mode: skip kill-switch / daily-loss check entirely
    if (ENV.MIRROR_CONFIG.copyMode === CopyMode.MIRROR) return true;

    const today = new Date().toISOString().split('T')[0];
    const currentBalance = await getMyBalance(ENV.PROXY_WALLET);

    if (dailyStartDate !== today) {
        dailyStartDate = today;
        dailyStartBalance = currentBalance;
        Logger.info(`📅 Daily balance reset: $${currentBalance.toFixed(2)}`);
    }

    if (dailyStartBalance !== null && dailyStartBalance > 0) {
        const lossPct = ((dailyStartBalance - currentBalance) / dailyStartBalance) * 100;
        if (lossPct >= DAILY_LOSS_CAP_PCT) {
            Logger.error(`🛑 KILL SWITCH: Daily loss ${lossPct.toFixed(1)}% exceeds ${DAILY_LOSS_CAP_PCT}% cap. Trading halted.`);
            killSwitchTriggered = true;
            telegram.killSwitch(lossPct);
            return false;
        }
    }
    return true;
};

// Create activity models for each user dynamically
const getUserActivityModels = () => ENV.USER_ADDRESSES.map((address) => ({
    address,
    model: getUserActivityModel(address),
}));

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

// Buffer for aggregating trades (only used in NORMAL mode)
const tradeAggregationBuffer: Map<string, AggregatedTrade> = new Map();

const readTempTrades = async (): Promise<TradeWithUser[]> => {
    const allTrades: TradeWithUser[] = [];
    const userActivityModels = getUserActivityModels();

    for (const { address, model } of userActivityModels) {
        const trades = await model
            .find({
                $and: [{ type: 'TRADE' }, { bot: false }, { botExcutedTime: 0 }],
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

/**
 * Generate a unique key for trade aggregation based on user, market, side
 */
const getAggregationKey = (trade: TradeWithUser): string => {
    return `${trade.userAddress}:${trade.conditionId}:${trade.asset}:${trade.side}`;
};

/**
 * Add trade to aggregation buffer or update existing aggregation
 */
const addToAggregationBuffer = (trade: TradeWithUser): void => {
    const key = getAggregationKey(trade);
    const existing = tradeAggregationBuffer.get(key);
    const now = Date.now();

    if (existing) {
        existing.trades.push(trade);
        existing.totalUsdcSize += trade.usdcSize;
        const totalValue = existing.trades.reduce((sum, t) => sum + t.usdcSize * t.price, 0);
        existing.averagePrice = totalValue / existing.totalUsdcSize;
        existing.lastTradeTime = now;
    } else {
        tradeAggregationBuffer.set(key, {
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

/**
 * Check buffer and return ready aggregated trades (NORMAL mode only)
 */
const getReadyAggregatedTrades = (): AggregatedTrade[] => {
    const ready: AggregatedTrade[] = [];
    const now = Date.now();
    const windowMs = ENV.TRADE_AGGREGATION_WINDOW_SECONDS * 1000;

    for (const [key, agg] of tradeAggregationBuffer.entries()) {
        const timeElapsed = now - agg.firstTradeTime;

        if (timeElapsed >= windowMs) {
            if (agg.totalUsdcSize >= TRADE_AGGREGATION_MIN_TOTAL_USD) {
                ready.push(agg);
            } else {
                Logger.info(
                    `Trade aggregation for ${agg.userAddress} on ${agg.slug || agg.asset}: $${agg.totalUsdcSize.toFixed(2)} total from ${agg.trades.length} trades below minimum ($${TRADE_AGGREGATION_MIN_TOTAL_USD}) - skipping`
                );

                for (const trade of agg.trades) {
                    const UserActivity = getUserActivityModel(trade.userAddress);
                    UserActivity.updateOne({ _id: trade._id }, { bot: true }).exec();
                }
            }
            tradeAggregationBuffer.delete(key);
        }
    }

    return ready;
};

// ─────────────────────────────────────────────────────────────────────────────
// MIRROR MODE EXECUTION ENGINE
// detect → transform(size only) → execute immediately (no batching)
// ─────────────────────────────────────────────────────────────────────────────
const doMirrorTrading = async (clobClient: ClobClient, trades: TradeWithUser[]) => {
    for (const trade of trades) {
        // Mark as being processed to prevent duplicate execution
        const UserActivity = getUserActivityModel(trade.userAddress);
        await UserActivity.updateOne({ _id: trade._id }, { $set: { botExcutedTime: 1 } });

        const orderType = trade.orderType ?? 'MARKET';
        Logger.info(
            `[TRADE DETECTED] MIRROR | ${trade.userAddress.slice(0, 6)}...${trade.userAddress.slice(-4)} | ${orderType} | size=$${trade.usdcSize} price=${trade.price}`
        );

        if (PREVIEW_MODE) {
            Logger.info('🔍 PREVIEW MODE — MIRROR trade logged but NOT executed');
            await UserActivity.updateOne({ _id: trade._id }, { bot: true });
            Logger.separator();
            continue;
        }

        // Fetch positions (needed for size calculation)
        const my_positions: UserPositionInterface[] = await fetchData(
            `https://data-api.polymarket.com/positions?user=${ENV.PROXY_WALLET}`
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

        const my_balance = await getMyBalance(ENV.PROXY_WALLET);
        const user_balance = user_positions.reduce((total, pos) => {
            return total + (pos.currentValue || 0);
        }, 0);

        // Calculate recent PnL ratio for ADAPTIVE sizing
        const recentPnl = user_positions.length > 0
            ? user_positions.reduce((sum, p) => sum + (p.percentPnl || 0), 0) / user_positions.length
            : 0;

        // Transform: only the size is adjusted. Everything else mirrors the original.
        const mirroredSize = calculateMirrorSize(
            ENV.MIRROR_CONFIG,
            trade.usdcSize,
            my_balance,
            user_balance,
            recentPnl
        );

        const mirroredTrade: UserActivityInterface = {
            ...trade,
            usdcSize: mirroredSize,
            // price and all other fields remain identical (exact replication intent)
        };

        Logger.info(
            `[TRADE EXECUTED] MIRROR | ${orderType} | side=${trade.side} size=$${mirroredSize.toFixed(2)} price=${trade.price}`
        );

        // Execute immediately — no aggregation, no batching
        await postOrder(
            clobClient,
            trade.side === 'BUY' ? 'buy' : 'sell',
            my_position,
            user_position,
            mirroredTrade,
            my_balance,
            trade.userAddress
        );

        Logger.separator();
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// NORMAL MODE EXECUTION ENGINE (unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────
const doTrading = async (clobClient: ClobClient, trades: TradeWithUser[]) => {
    for (const trade of trades) {
        if (killSwitchTriggered) {
            Logger.warning('🛑 Kill switch active — skipping trade');
            return;
        }
        if (!(await checkDailyLoss())) return;

        const UserActivity = getUserActivityModel(trade.userAddress);
        await UserActivity.updateOne({ _id: trade._id }, { $set: { botExcutedTime: 1 } });

        Logger.trade(trade.userAddress, trade.side || 'UNKNOWN', {
            asset: trade.asset,
            side: trade.side,
            amount: trade.usdcSize,
            price: trade.price,
            slug: trade.slug,
            eventSlug: trade.eventSlug,
            transactionHash: trade.transactionHash,
        });

        if (PREVIEW_MODE) {
            Logger.info('🔍 PREVIEW MODE — trade logged but NOT executed');
            await UserActivity.updateOne({ _id: trade._id }, { bot: true });
            Logger.separator();
            continue;
        }

        const my_positions: UserPositionInterface[] = await fetchData(
            `https://data-api.polymarket.com/positions?user=${ENV.PROXY_WALLET}`
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

        const my_balance = await getMyBalance(ENV.PROXY_WALLET);

        const user_balance = user_positions.reduce((total, pos) => {
            return total + (pos.currentValue || 0);
        }, 0);

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

        Logger.separator();
    }
};

/**
 * Execute aggregated trades (NORMAL mode only)
 */
const doAggregatedTrading = async (clobClient: ClobClient, aggregatedTrades: AggregatedTrade[]) => {
    for (const agg of aggregatedTrades) {
        Logger.header(`📊 AGGREGATED TRADE (${agg.trades.length} trades combined)`);
        Logger.info(`Market: ${agg.slug || agg.asset}`);
        Logger.info(`Side: ${agg.side}`);
        Logger.info(`Total volume: $${agg.totalUsdcSize.toFixed(2)}`);
        Logger.info(`Average price: $${agg.averagePrice.toFixed(4)}`);

        for (const trade of agg.trades) {
            const UserActivity = getUserActivityModel(trade.userAddress);
            await UserActivity.updateOne({ _id: trade._id }, { $set: { botExcutedTime: 1 } });
        }

        const my_positions: UserPositionInterface[] = await fetchData(
            `https://data-api.polymarket.com/positions?user=${ENV.PROXY_WALLET}`
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

        const my_balance = await getMyBalance(ENV.PROXY_WALLET);

        const user_balance = user_positions.reduce((total, pos) => {
            return total + (pos.currentValue || 0)
        }, 0);

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

        Logger.separator();
    }
};

// Track if executor should continue running
let isRunning = true;

/**
 * Stop the trade executor gracefully
 */
export const stopTradeExecutor = () => {
    isRunning = false;
    Logger.info('Trade executor shutdown requested...');
};

const tradeExecutor = async (clobClient: ClobClient) => {
    Logger.success(`Trade executor ready for ${ENV.USER_ADDRESSES.length} trader(s)`);
    if (telegram.isEnabled()) {
        Logger.info('📱 Telegram notifications enabled');
    }
    if (PREVIEW_MODE) {
        Logger.warning('🔍 PREVIEW MODE ACTIVE — trades will be logged but NOT executed');
    }

    if (ENV.MIRROR_CONFIG.copyMode === CopyMode.MIRROR) {
        Logger.info(`🪞 MIRROR MODE ACTIVE | size strategy: ${ENV.MIRROR_CONFIG.mirrorSizeMode}`);
        Logger.info('   ↳ No filters · No risk checks · No stop-loss · Immediate execution');
    } else {
        Logger.info(`🛡️ Daily loss cap: ${DAILY_LOSS_CAP_PCT}% (set DAILY_LOSS_CAP_PCT to adjust)`);
        if (ENV.TRADE_AGGREGATION_ENABLED) {
            Logger.info(
                `Trade aggregation enabled: ${ENV.TRADE_AGGREGATION_WINDOW_SECONDS}s window, $${TRADE_AGGREGATION_MIN_TOTAL_USD} minimum`
            );
        }
    }

    let lastCheck = Date.now();
    while (isRunning) {
        const trades = await readTempTrades();

        if (ENV.MIRROR_CONFIG.copyMode === CopyMode.MIRROR) {
            // ── MIRROR PIPELINE: detect → transform(size only) → execute immediately ──
            if (trades.length > 0) {
                Logger.clearLine();
                await doMirrorTrading(clobClient, trades);
                lastCheck = Date.now();
            } else {
                if (Date.now() - lastCheck > 300) {
                    Logger.waiting(ENV.USER_ADDRESSES.length);
                    lastCheck = Date.now();
                }
            }
        } else if (ENV.TRADE_AGGREGATION_ENABLED) {
            // ── NORMAL + AGGREGATION PIPELINE ──────────────────────────────────────
            if (trades.length > 0) {
                Logger.clearLine();
                Logger.info(
                    `📥 ${trades.length} new trade${trades.length > 1 ? 's' : ''} detected`
                );

                for (const trade of trades) {
                    if (trade.side === 'BUY' && trade.usdcSize < TRADE_AGGREGATION_MIN_TOTAL_USD) {
                        Logger.info(
                            `Adding $${trade.usdcSize.toFixed(2)} ${trade.side} trade to aggregation buffer for ${trade.slug || trade.asset}`
                        );
                        addToAggregationBuffer(trade);
                    } else {
                        Logger.clearLine();
                        Logger.header('⚡ IMMEDIATE TRADE (above threshold)');
                        await doTrading(clobClient, [trade]);
                    }
                }
                lastCheck = Date.now();
            }

            const readyAggregations = getReadyAggregatedTrades();
            if (readyAggregations.length > 0) {
                Logger.clearLine();
                Logger.header(
                    `⚡ ${readyAggregations.length} AGGREGATED TRADE${readyAggregations.length > 1 ? 'S' : ''} READY`
                );
                await doAggregatedTrading(clobClient, readyAggregations);
                lastCheck = Date.now();
            }

            if (trades.length === 0 && readyAggregations.length === 0) {
                if (Date.now() - lastCheck > 300) {
                    const bufferedCount = tradeAggregationBuffer.size;
                    if (bufferedCount > 0) {
                        Logger.waiting(
                            ENV.USER_ADDRESSES.length,
                            `${bufferedCount} trade group(s) pending`
                        );
                    } else {
                        Logger.waiting(ENV.USER_ADDRESSES.length);
                    }
                    lastCheck = Date.now();
                }
            }
        } else {
            // ── NORMAL PIPELINE (no aggregation) ────────────────────────────────────
            if (trades.length > 0) {
                Logger.clearLine();
                Logger.header(
                    `⚡ ${trades.length} NEW TRADE${trades.length > 1 ? 'S' : ''} TO COPY`
                );
                await doTrading(clobClient, trades);
                lastCheck = Date.now();
            } else {
                if (Date.now() - lastCheck > 300) {
                    Logger.waiting(USER_ADDRESSES.length);
                    lastCheck = Date.now();
                }
            }
        }

        if (!isRunning) break;
        await new Promise((resolve) => setTimeout(resolve, 300));
    }

    Logger.info('Trade executor stopped');
};

export default tradeExecutor;
