import createClobClient from './createClobClient';
import { ACTIVE_TENANTS } from './settings';
import { AssetType } from '@polymarket/clob-client';

const getMyBalance = async (proxyWallet: string): Promise<number> => {
    try {
        const tenant = ACTIVE_TENANTS.find(t => t.proxyWallet === proxyWallet);
        if (!tenant) return 0;
        
        const client = await createClobClient(tenant.privateKey, proxyWallet);
        const balanceData = await client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
        return parseFloat(balanceData.balance);
    } catch (error) {
        return 0;
    }
};

export default getMyBalance;
