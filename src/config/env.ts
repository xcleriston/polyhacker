import * as dotenv from 'dotenv';
import { CopyStrategy, CopyStrategyConfig, parseTieredMultipliers } from './copyStrategy';
import { parseMirrorConfig } from './mirrorMode';
dotenv.config();

/**
 * Validate Ethereum address format
 */
const isValidEthereumAddress = (address: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
};

/**
 * Validate required environment variables
 */
const validateRequiredEnv = (): void => {
    const required = ['DATABASE_URL'];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        console.warn(`\n⚠️ Missing required environment variables: ${missing.join(', ')}`);
        console.warn('⚠️ The bot may not function correctly until these are set.\n');
    }
};

/**
 * Validate Ethereum addresses
 */
const validateAddresses = (): void => {
    if (process.env.PROXY_WALLET && !isValidEthereumAddress(process.env.PROXY_WALLET)) {
        console.warn(`\n⚠️ Invalid PROXY_WALLET: ${process.env.PROXY_WALLET}. Expected a valid Ethereum address.\n`);
    }

    if (
        process.env.USDC_CONTRACT_ADDRESS &&
        !isValidEthereumAddress(process.env.USDC_CONTRACT_ADDRESS)
    ) {
        console.warn(`\n⚠️ Invalid USDC_CONTRACT_ADDRESS: ${process.env.USDC_CONTRACT_ADDRESS}. Expected a valid Ethereum address.\n`);
    }
};

/**
 * Validate numeric configuration values
 */
const validateNumericConfig = (): void => {
    const fetchInterval = parseInt(process.env.FETCH_INTERVAL || '1', 10);
    if (isNaN(fetchInterval) || fetchInterval <= 0) {
        throw new Error(
            `Invalid FETCH_INTERVAL: ${process.env.FETCH_INTERVAL}. Must be a positive integer.`
        );
    }

    const retryLimit = parseInt(process.env.RETRY_LIMIT || '3', 10);
    if (isNaN(retryLimit) || retryLimit < 1 || retryLimit > 10) {
        throw new Error(
            `Invalid RETRY_LIMIT: ${process.env.RETRY_LIMIT}. Must be between 1 and 10.`
        );
    }

    const tooOldTimestamp = parseInt(process.env.TOO_OLD_TIMESTAMP || '24', 10);
    if (isNaN(tooOldTimestamp) || tooOldTimestamp < 1) {
        throw new Error(
            `Invalid TOO_OLD_TIMESTAMP: ${process.env.TOO_OLD_TIMESTAMP}. Must be a positive integer (hours).`
        );
    }

    const requestTimeout = parseInt(process.env.REQUEST_TIMEOUT_MS || '10000', 10);
    if (isNaN(requestTimeout) || requestTimeout < 1000) {
        throw new Error(
            `Invalid REQUEST_TIMEOUT_MS: ${process.env.REQUEST_TIMEOUT_MS}. Must be at least 1000ms.`
        );
    }

    const networkRetryLimit = parseInt(process.env.NETWORK_RETRY_LIMIT || '3', 10);
    if (isNaN(networkRetryLimit) || networkRetryLimit < 1 || networkRetryLimit > 10) {
        throw new Error(
            `Invalid NETWORK_RETRY_LIMIT: ${process.env.NETWORK_RETRY_LIMIT}. Must be between 1 and 10.`
        );
    }
};

/**
 * Validate URL formats
 */
const validateUrls = (): void => {
    if (process.env.CLOB_HTTP_URL && !process.env.CLOB_HTTP_URL.startsWith('http')) {
        console.error('\n❌ Invalid CLOB_HTTP_URL\n');
        console.error(`Current value: ${process.env.CLOB_HTTP_URL}`);
        console.error('Default value: https://clob.polymarket.com/\n');
        console.error('⚠️  Use the default value unless you have a specific reason to change it!\n');
        throw new Error(
            `Invalid CLOB_HTTP_URL: ${process.env.CLOB_HTTP_URL}. Must be a valid HTTP/HTTPS URL.`
        );
    }

    if (process.env.CLOB_WS_URL && !process.env.CLOB_WS_URL.startsWith('ws')) {
        console.error('\n❌ Invalid CLOB_WS_URL\n');
        console.error(`Current value: ${process.env.CLOB_WS_URL}`);
        console.error('Default value: wss://ws-subscriptions-clob.polymarket.com/ws\n');
        console.error('⚠️  Use the default value unless you have a specific reason to change it!\n');
        throw new Error(
            `Invalid CLOB_WS_URL: ${process.env.CLOB_WS_URL}. Must be a valid WebSocket URL (ws:// or wss://).`
        );
    }

    if (process.env.RPC_URL && !process.env.RPC_URL.startsWith('http')) {
        console.error('\n❌ Invalid RPC_URL\n');
        console.error(`Current value: ${process.env.RPC_URL}`);
        console.error('Must start with: http:// or https://\n');
        console.error('💡 Get a free RPC endpoint from:');
        console.error('   • Infura:  https://infura.io');
        console.error('   • Alchemy: https://www.alchemy.com');
        console.error('   • Ankr:    https://www.ankr.com\n');
        console.error('Example: https://polygon-mainnet.infura.io/v3/YOUR_PROJECT_ID\n');
        throw new Error(`Invalid RPC_URL: ${process.env.RPC_URL}. Must be a valid HTTP/HTTPS URL.`);
    }
};

// Run all validations
validateRequiredEnv();
validateAddresses();
validateNumericConfig();
validateUrls();

// Parse USER_ADDRESSES: supports both comma-separated string and JSON array
const parseUserAddresses = (input: string | undefined): string[] => {
    if (!input) return [];
    
    // Strip surrounding quotes if present
    let rawInput = input.trim();
    if ((rawInput.startsWith('"') && rawInput.endsWith('"')) || (rawInput.startsWith("'") && rawInput.endsWith("'"))) {
        rawInput = rawInput.slice(1, -1).trim();
    }

    // Check if it's JSON array format
    if (rawInput.startsWith('[') && rawInput.endsWith(']')) {
        try {
            const parsed = JSON.parse(rawInput);
            if (Array.isArray(parsed)) {
                return parsed
                    .map((addr) => addr.toLowerCase().trim())
                    .filter((addr) => {
                        if (!isValidEthereumAddress(addr)) {
                            console.warn(`⚠️ Skipping invalid Ethereum address in USER_ADDRESSES: "${addr}"`);
                            return false;
                        }
                        return true;
                    });
            }
        } catch (e) {
            console.error(`❌ Error parsing JSON for USER_ADDRESSES: ${e instanceof Error ? e.message : String(e)}`);
            // Fallback to comma-separated if JSON parse fails
        }
    }
    
    // Otherwise treat as comma-separated
    return rawInput
        .split(',')
        .map((addr) => addr.toLowerCase().trim())
        .filter((addr) => addr.length > 0)
        .filter((addr) => {
            if (!isValidEthereumAddress(addr)) {
                console.warn(`⚠️ Skipping invalid Ethereum address in USER_ADDRESSES: "${addr}"`);
                return false;
            }
            return true;
        });
};

// Parse copy strategy configuration
const parseCopyStrategy = (): CopyStrategyConfig => {
    // Support legacy COPY_PERCENTAGE + TRADE_MULTIPLIER for backward compatibility
    const hasLegacyConfig = process.env.COPY_PERCENTAGE && !process.env.COPY_STRATEGY;

    if (hasLegacyConfig) {
        console.warn(
            '⚠️  Using legacy COPY_PERCENTAGE configuration. Consider migrating to COPY_STRATEGY.'
        );
        const copyPercentage = parseFloat(process.env.COPY_PERCENTAGE || '10.0');
        const tradeMultiplier = parseFloat(process.env.TRADE_MULTIPLIER || '1.0');
        const effectivePercentage = copyPercentage * tradeMultiplier;

        const config: CopyStrategyConfig = {
            strategy: CopyStrategy.PERCENTAGE,
            copySize: effectivePercentage,
            maxOrderSizeUSD: parseFloat(process.env.MAX_ORDER_SIZE_USD || '100.0'),
            minOrderSizeUSD: parseFloat(process.env.MIN_ORDER_SIZE_USD || '1.0'),
            maxPositionSizeUSD: process.env.MAX_POSITION_SIZE_USD
                ? parseFloat(process.env.MAX_POSITION_SIZE_USD)
                : undefined,
            maxDailyVolumeUSD: process.env.MAX_DAILY_VOLUME_USD
                ? parseFloat(process.env.MAX_DAILY_VOLUME_USD)
                : undefined,
        };

        // Parse tiered multipliers if configured (even for legacy mode)
        if (process.env.TIERED_MULTIPLIERS) {
            try {
                config.tieredMultipliers = parseTieredMultipliers(process.env.TIERED_MULTIPLIERS);
                console.log(`✓ Loaded ${config.tieredMultipliers.length} tiered multipliers`);
            } catch (error) {
                throw new Error(`Failed to parse TIERED_MULTIPLIERS: ${error instanceof Error ? error.message : String(error)}`);
            }
        } else if (tradeMultiplier !== 1.0) {
            // If using legacy single multiplier, store it
            config.tradeMultiplier = tradeMultiplier;
        }

        return config;
    }

    // Parse new copy strategy configuration
    const strategyStr = (process.env.COPY_STRATEGY || 'PERCENTAGE').toUpperCase();
    const strategy =
        CopyStrategy[strategyStr as keyof typeof CopyStrategy] || CopyStrategy.PERCENTAGE;

    const config: CopyStrategyConfig = {
        strategy,
        copySize: parseFloat(process.env.COPY_SIZE || '10.0'),
        maxOrderSizeUSD: parseFloat(process.env.MAX_ORDER_SIZE_USD || '100.0'),
        minOrderSizeUSD: parseFloat(process.env.MIN_ORDER_SIZE_USD || '1.0'),
        maxPositionSizeUSD: process.env.MAX_POSITION_SIZE_USD
            ? parseFloat(process.env.MAX_POSITION_SIZE_USD)
            : undefined,
        maxDailyVolumeUSD: process.env.MAX_DAILY_VOLUME_USD
            ? parseFloat(process.env.MAX_DAILY_VOLUME_USD)
            : undefined,
    };

    // Add adaptive strategy parameters if applicable
    if (strategy === CopyStrategy.ADAPTIVE) {
        config.adaptiveMinPercent = parseFloat(
            process.env.ADAPTIVE_MIN_PERCENT || config.copySize.toString()
        );
        config.adaptiveMaxPercent = parseFloat(
            process.env.ADAPTIVE_MAX_PERCENT || config.copySize.toString()
        );
        config.adaptiveThreshold = parseFloat(process.env.ADAPTIVE_THRESHOLD_USD || '500.0');
    }

    // Parse tiered multipliers if configured
    if (process.env.TIERED_MULTIPLIERS) {
        try {
            config.tieredMultipliers = parseTieredMultipliers(process.env.TIERED_MULTIPLIERS);
            console.log(`✓ Loaded ${config.tieredMultipliers.length} tiered multipliers`);
        } catch (error) {
            throw new Error(`Failed to parse TIERED_MULTIPLIERS: ${error instanceof Error ? error.message : String(error)}`);
        }
    } else if (process.env.TRADE_MULTIPLIER) {
        // Fall back to single multiplier if no tiers configured
        const singleMultiplier = parseFloat(process.env.TRADE_MULTIPLIER);
        if (singleMultiplier !== 1.0) {
            config.tradeMultiplier = singleMultiplier;
            console.log(`✓ Using single trade multiplier: ${singleMultiplier}x`);
        }
    }

    return config;
};

export const ENV = {
    USER_ADDRESSES: parseUserAddresses(process.env.USER_ADDRESSES as string),
    PROXY_WALLET: process.env.PROXY_WALLET as string,
    PRIVATE_KEY: process.env.PRIVATE_KEY as string,
    CLOB_HTTP_URL: process.env.CLOB_HTTP_URL || 'https://clob.polymarket.com/',
    CLOB_WS_URL: process.env.CLOB_WS_URL || 'wss://ws-subscriptions-clob.polymarket.com/ws',
    FETCH_INTERVAL: parseInt(process.env.FETCH_INTERVAL || '1', 10),
    TOO_OLD_TIMESTAMP: parseInt(process.env.TOO_OLD_TIMESTAMP || '24', 10),
    RETRY_LIMIT: parseInt(process.env.RETRY_LIMIT || '3', 10),
    // Legacy parameters (kept for backward compatibility)
    TRADE_MULTIPLIER: parseFloat(process.env.TRADE_MULTIPLIER || '1.0'),
    COPY_PERCENTAGE: parseFloat(process.env.COPY_PERCENTAGE || '10.0'),
    // New copy strategy configuration
    COPY_STRATEGY_CONFIG: parseCopyStrategy(),
    // Network settings
    REQUEST_TIMEOUT_MS: parseInt(process.env.REQUEST_TIMEOUT_MS || '10000', 10),
    NETWORK_RETRY_LIMIT: parseInt(process.env.NETWORK_RETRY_LIMIT || '3', 10),
    // Trade aggregation settings
    TRADE_AGGREGATION_ENABLED: process.env.TRADE_AGGREGATION_ENABLED === 'true',
    TRADE_AGGREGATION_WINDOW_SECONDS: parseInt(
        process.env.TRADE_AGGREGATION_WINDOW_SECONDS || '300',
        10
    ), // 5 minutes default
    RPC_URL: process.env.RPC_URL || 'https://polygon-rpc.com/',
    USDC_CONTRACT_ADDRESS: process.env.USDC_CONTRACT_ADDRESS || '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    // Mirror mode configuration
    MIRROR_CONFIG: parseMirrorConfig(),
    // Telegram
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '918021282',
};
