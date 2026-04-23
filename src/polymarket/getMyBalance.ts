import createClobClient from '@/polymarket/createClobClient';
import { ACTIVE_TENANTS } from '@/lib/settings';
import { AssetType } from '@polymarket/clob-client';
import { ethers } from 'ethers';
import fetchData from '@/lib/fetchData';

/**
 * Agent 5: Funder Validation Engine
 * Ensures funderAddress is correct and auto-corrects if needed
 */
const validateAndCorrectFunder = async (signerAddress: string, providedFunder?: string): Promise<string> => {
    try {
        // 1. Fetch official Polymarket profile
        const profile = await fetchData(`https://data-api.polymarket.com/profiles?address=${signerAddress}`);
        const officialProxy = profile?.proxyAddress || profile?.address;
        
        if (officialProxy && officialProxy.toLowerCase() !== providedFunder?.toLowerCase()) {
            console.log(`[Agent 5] Funder mismatch detected. Official: ${officialProxy}, Provided: ${providedFunder}. Auto-correcting...`);
            return officialProxy;
        }
        return providedFunder || signerAddress;
    } catch (e) {
        return providedFunder || signerAddress;
    }
};

/**
 * Agent 4: Balance Fix Engine
 */
const getMyBalance = async (proxyWallet: string): Promise<number> => {
    try {
        const tenant = ACTIVE_TENANTS.find(t => t.proxyWallet === proxyWallet);
        if (!tenant) return 0;
        
        const signerAddress = new ethers.Wallet(tenant.privateKey).address;
        
        // Agent 5: Validate and correct funder
        const correctedFunder = await validateAndCorrectFunder(signerAddress, proxyWallet);
        
        const client = await createClobClient(tenant.privateKey, correctedFunder);
        
        // Agent 4: ALWAYS call update BEFORE get
        // NEVER use ethers.getBalance()
        await client.updateBalanceAllowance({
            asset_type: AssetType.COLLATERAL
        });
        
        const balanceData = await client.getBalanceAllowance({ 
            asset_type: AssetType.COLLATERAL 
        });
        
        return parseFloat(balanceData.balance);
    } catch (error) {
        console.error(`[Agent 4] Balance fetch failed: ${error}`);
        return 0;
    }
};

export default getMyBalance;

