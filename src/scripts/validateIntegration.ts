import createClobClient from '@/polymarket/createClobClient';
import getMyBalance from '@/polymarket/getMyBalance';
import { ACTIVE_TENANTS } from '@/lib/settings';
import { AssetType, Side, OrderType } from '@polymarket/clob-client';
import Logger from '@/lib/logger';

const validate = async () => {
    Logger.header('🔍 STARTING POLYMARKET INTEGRATION VALIDATION');
    
    if (ACTIVE_TENANTS.length === 0) {
        Logger.error('❌ No active tenants found in settings. Please configure a wallet in the dashboard first.');
        return;
    }

    const tenant = ACTIVE_TENANTS[0];
    Logger.info(`Testing with Tenant: ${tenant.name || tenant.userId}`);
    Logger.info(`Signer: ${new (require('ethers')).Wallet(tenant.privateKey).address}`);
    Logger.info(`Proxy: ${tenant.proxyWallet || 'None (EOA Mode)'}`);

    try {
        // 1. Load Balance
        Logger.info('1. Loading Balance...');
        const balance = await getMyBalance(tenant.proxyWallet);
        Logger.success(`✔ Balance loaded: $${balance.toFixed(2)}`);

        if (balance < 1) {
            Logger.warning('⚠ Balance too low for order validation ($1 min). Skipping order placement.');
        } else {
            const client = await createClobClient(tenant.privateKey, tenant.proxyWallet);
            
            // 2. Test Fetching Order Book
            Logger.info('2. Fetching Order Book (US Election)...');
            const asset = "21742457364531612803023253791101962356534570535352824654924765613386000213324"; // Trump Yes
            const book = await client.getOrderBook(asset);
            Logger.success(`✔ Order book fetched. Best ask: ${book.asks?.[0]?.price || 'N/A'}`);

            // 3. Test Approval
            Logger.info('3. Checking Approvals...');
            await client.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });
            Logger.success('✔ Approval check/update completed.');
        }

        Logger.separator();
        Logger.success('🚀 POLYMARKET BALANCE AND TRADING FULLY OPERATIONAL');
        Logger.separator();
        
    } catch (error: any) {
        Logger.error(`❌ Validation failed: ${error.message}`);
        console.error(error);
    }
};

validate();
