/**
 * poly-hacker: Mirror Mode Configuration
 *
 * MIRROR mode replicates trades exactly from the target trader with no filters,
 * no risk checks, and no validation overrides. Only the order size may be
 * adjusted according to MIRROR_SIZE_MODE.
 */

export enum CopyMode {
    NORMAL = 'NORMAL',
    MIRROR = 'MIRROR',
}

export enum MirrorSizeMode {
    PERCENTAGE = 'PERCENTAGE',
    FIXED = 'FIXED',
    ADAPTIVE = 'ADAPTIVE',
}

export type OrderType = 'MARKET' | 'LIMIT';

export interface MirrorConfig {
    copyMode: CopyMode;
    mirrorSizeMode: MirrorSizeMode;
    fixedAmount: number;
}

export interface DetectedTrade {
    type: OrderType;
    price?: number;
    size: number;
    usdcSize: number;
    side: string;
    asset: string;
    conditionId: string;
    [key: string]: unknown;
}

/**
 * Parse mirror configuration from environment variables.
 */
export function parseMirrorConfig(): MirrorConfig {
    const copyModeStr = (process.env.COPY_MODE || 'NORMAL').toUpperCase();
    const copyMode =
        copyModeStr === 'MIRROR' ? CopyMode.MIRROR : CopyMode.NORMAL;

    const sizeModeStr = (process.env.MIRROR_SIZE_MODE || 'PERCENTAGE').toUpperCase();
    let mirrorSizeMode: MirrorSizeMode;
    switch (sizeModeStr) {
        case 'FIXED':
            mirrorSizeMode = MirrorSizeMode.FIXED;
            break;
        case 'ADAPTIVE':
            mirrorSizeMode = MirrorSizeMode.ADAPTIVE;
            break;
        default:
            mirrorSizeMode = MirrorSizeMode.PERCENTAGE;
    }

    const fixedAmount = parseFloat(process.env.FIXED_AMOUNT || '10.0');

    return { copyMode, mirrorSizeMode, fixedAmount };
}

/**
 * Detect whether a trade is MARKET or LIMIT based on available data.
 * Polymarket activity records that contain a non-zero price are treated
 * as LIMIT orders; zero-price or missing-price records are MARKET.
 */
export function detectOrderType(price: number | undefined): OrderType {
    if (price !== undefined && price > 0 && price < 1) {
        return 'LIMIT';
    }
    return 'MARKET';
}

/**
 * Calculate the mirrored order size according to the configured sizing strategy.
 * Only the size is adjusted — everything else is kept identical to the original trade.
 *
 * @param config       - Mirror configuration
 * @param traderSize   - Trader's original order size in USD
 * @param myBalance    - Copier's current USDC balance
 * @param traderBalance - Trader's estimated portfolio value in USD
 * @param recentPnl    - Recent PnL ratio (positive = profitable) for ADAPTIVE mode
 */
export function calculateMirrorSize(
    config: MirrorConfig,
    traderSize: number,
    myBalance: number,
    traderBalance: number,
    recentPnl: number = 0
): number {
    switch (config.mirrorSizeMode) {
        case MirrorSizeMode.PERCENTAGE: {
            if (traderBalance <= 0) return traderSize;
            return traderSize * (myBalance / traderBalance);
        }
        case MirrorSizeMode.FIXED: {
            return config.fixedAmount;
        }
        case MirrorSizeMode.ADAPTIVE: {
            if (traderBalance <= 0) return traderSize;
            const baseSize = traderSize * (myBalance / traderBalance);
            const performanceFactor = Math.max(0.5, Math.min(2.0, 1 + recentPnl));
            const balanceFactor = Math.min(1.0, myBalance / Math.max(1, traderSize));
            return baseSize * performanceFactor * balanceFactor;
        }
        default:
            return traderSize;
    }
}

