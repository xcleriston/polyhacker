import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { ENV } from '@/lib/config/env';
import { UserActivityInterface, UserPositionInterface } from '@/lib/interfaces/User';
import { getUserActivityModel } from '@/lib/models/userHistory';
import Logger from '@/lib/logger';
import { calculateOrderSize, getTradeMultiplier } from '@/lib/config/copyStrategy';
import createClobClient from '@/polymarket/createClobClient';
import fetchData from '@/lib/fetchData';

const RETRY_LIMIT = ENV.RETRY_LIMIT;
const COPY_STRATEGY_CONFIG = ENV.COPY_STRATEGY_CONFIG;
const SLIPPAGE_TOLERANCE = parseFloat(process.env.SLIPPAGE_TOLERANCE || '0.05');

// Polymarket minimum order sizes
const MIN_ORDER_SIZE_USD = 1.0;
const MIN_ORDER_SIZE_TOKENS = 1.0;

const extractOrderError = (response: unknown): string | undefined => {
    if (!response) return undefined;
    if (typeof response === 'string') return response;
    if (typeof response === 'object') {
        const data = response as Record<string, unknown>;
        const directError = data.error;
        if (typeof directError === 'string') return directError;
        if (typeof directError === 'object' && directError !== null) {
            const nested = directError as Record<string, unknown>;
            if (typeof nested.error === 'string') return nested.error;
            if (typeof nested.message === 'string') return nested.message;
        }
        if (typeof data.errorMsg === 'string') return data.errorMsg;
        if (typeof data.message === 'string') return data.message;
    }
    return undefined;
};

const isInsufficientBalanceOrAllowanceError = (message: string | undefined): boolean => {
    if (!message) return false;
    const lower = message.toLowerCase();
    return lower.includes('not enough balance') || lower.includes('allowance');
};

const isAuthOrSignatureError = (message: string | undefined): boolean => {
    if (!message) return false;
    const lower = message.toLowerCase();
    return lower.includes('invalid signature') || lower.includes('auth') || lower.includes('unauthorized');
};

const postOrder = async (
    clobClient: ClobClient,
    condition: string,
    provided_my_position: UserPositionInterface | undefined,
    provided_user_position: UserPositionInterface | undefined,
    trade: UserActivityInterface,
    my_balance: number,
    userAddress: string,
    privateKey?: string
) => {
    let currentClient = clobClient;
    const UserActivity = getUserActivityModel(userAddress);
    const funderAddress = (currentClient as any).funderAddress || (currentClient as any).address;
    
    // Auto-fetch positions if not provided
    let my_position = provided_my_position;
    let user_position = provided_user_position;
    
    if (!my_position || !user_position) {
        try {
            const [my_positions, user_positions] = await Promise.all([
                fetchData(`https://data-api.polymarket.com/positions?user=${funderAddress}`),
                fetchData(`https://data-api.polymarket.com/positions?user=${userAddress}`)
            ]);
            my_position = my_positions.find((p: any) => p.conditionId === trade.conditionId);
            user_position = user_positions.find((p: any) => p.conditionId === trade.conditionId);
        } catch (e) {}
    }

    if (condition === 'buy') {
        Logger.info('Executing BUY strategy...');
        const currentPositionValue = my_position ? my_position.size * my_position.avgPrice : 0;
        const orderCalc = calculateOrderSize(COPY_STRATEGY_CONFIG, trade.usdcSize, my_balance, currentPositionValue);
        
        if (orderCalc.finalAmount === 0) {
            Logger.warning(`[Executor] Skipping trade for ${userAddress}: calculated amount is $0.00 (Balance: $${my_balance})`);
            await UserActivity.updateOne({ _id: (trade as any)._id }, { bot: true });
            return;
        }

        let remaining = orderCalc.finalAmount;
        let retry = 0;
        let totalBoughtTokens = 0;

        while (remaining > 0 && retry < RETRY_LIMIT) {
            const orderBook = await currentClient.getOrderBook(trade.asset);
            if (!orderBook.asks || orderBook.asks.length === 0) break;

            const minPriceAsk = orderBook.asks.reduce((min, ask) => parseFloat(ask.price) < parseFloat(min.price) ? ask : min, orderBook.asks[0]);
            if (parseFloat(minPriceAsk.price) - SLIPPAGE_TOLERANCE > trade.price) break;

            if (remaining < MIN_ORDER_SIZE_USD) break;

            const orderSize = Math.min(remaining, parseFloat(minPriceAsk.size) * parseFloat(minPriceAsk.price));
            const order_arges = { side: Side.BUY, tokenID: trade.asset, amount: orderSize, price: parseFloat(minPriceAsk.price) };

            try {
                const signedOrder = await currentClient.createMarketOrder(order_arges);
                const resp = await currentClient.postOrder(signedOrder, OrderType.FOK);
                
                if (resp.success === true) {
                    retry = 0;
                    totalBoughtTokens += order_arges.amount / order_arges.price;
                    remaining -= order_arges.amount;
                } else {
                    const error = extractOrderError(resp);
                    if (isAuthOrSignatureError(error) && privateKey) {
                        currentClient = await createClobClient(privateKey, funderAddress);
                        retry++;
                        continue;
                    }
                    if (isInsufficientBalanceOrAllowanceError(error)) break;
                    retry++;
                }
            } catch (e) { retry++; }
        }
        await UserActivity.updateOne({ _id: trade._id }, { bot: true, myBoughtSize: totalBoughtTokens });
    } else if (condition === 'sell') {
        Logger.info('Executing SELL strategy...');
        if (!my_position) {
            await UserActivity.updateOne({ _id: trade._id }, { bot: true });
            return;
        }

        const previousBuys = await UserActivity.find({ asset: trade.asset, conditionId: trade.conditionId, side: 'BUY', bot: true, myBoughtSize: { $gt: 0 } }).exec();
        const totalBoughtTokens = previousBuys.reduce((sum: number, buy: any) => sum + (buy.myBoughtSize || 0), 0);
        
        let remaining = 0;
        if (!user_position) {
            remaining = my_position.size;
        } else {
            const trader_sell_percent = trade.size / (user_position.size + trade.size);
            const baseSellSize = totalBoughtTokens > 0 ? totalBoughtTokens * trader_sell_percent : my_position.size * trader_sell_percent;
            remaining = baseSellSize * getTradeMultiplier(COPY_STRATEGY_CONFIG, trade.usdcSize);
        }

        if (remaining < MIN_ORDER_SIZE_TOKENS) {
            await UserActivity.updateOne({ _id: trade._id }, { bot: true });
            return;
        }
        if (remaining > my_position.size) remaining = my_position.size;

        let retry = 0;
        let totalSoldTokens = 0;

        while (remaining > 0 && retry < RETRY_LIMIT) {
            const orderBook = await currentClient.getOrderBook(trade.asset);
            if (!orderBook.bids || orderBook.bids.length === 0) break;

            const maxPriceBid = orderBook.bids.reduce((max, bid) => parseFloat(bid.price) > parseFloat(max.price) ? bid : max, orderBook.bids[0]);
            const sellAmount = Math.min(remaining, parseFloat(maxPriceBid.size));

            if (sellAmount < MIN_ORDER_SIZE_TOKENS) break;

            const order_arges = { side: Side.SELL, tokenID: trade.asset, amount: sellAmount, price: parseFloat(maxPriceBid.price) };
            try {
                const signedOrder = await currentClient.createMarketOrder(order_arges);
                const resp = await currentClient.postOrder(signedOrder, OrderType.FOK);
                if (resp.success === true) {
                    retry = 0;
                    totalSoldTokens += order_arges.amount;
                    remaining -= order_arges.amount;
                } else {
                    const error = extractOrderError(resp);
                    if (isAuthOrSignatureError(error) && privateKey) {
                        currentClient = await createClobClient(privateKey, funderAddress);
                        retry++;
                        continue;
                    }
                    if (isInsufficientBalanceOrAllowanceError(error)) break;
                    retry++;
                }
            } catch (e) { retry++; }
        }

        if (totalSoldTokens > 0 && totalBoughtTokens > 0) {
            const sellPercentage = totalSoldTokens / totalBoughtTokens;
            if (sellPercentage >= 0.99) {
                await UserActivity.updateMany({ asset: trade.asset, conditionId: trade.conditionId, side: 'BUY', bot: true }, { $set: { myBoughtSize: 0 } });
            } else {
                for (const buy of previousBuys) {
                    await UserActivity.updateOne({ _id: buy._id }, { $set: { myBoughtSize: (buy.myBoughtSize || 0) * (1 - sellPercentage) } });
                }
            }
        }
        await UserActivity.updateOne({ _id: trade._id }, { bot: true });
    }
};

export default postOrder;

