import createClobClient from '@/polymarket/createClobClient';
import { AssetType } from '@polymarket/clob-client';
import fetchData from '@/lib/fetchData';
import { ethers } from 'ethers';

/**
 * Agent 5: Funder Validation
 */
const validateAndCorrectFunder = async (signerAddress: string, providedFunder?: string): Promise<string> => {
    try {
        const profile = await fetchData(`https://data-api.polymarket.com/profiles?address=${signerAddress}`);
        const officialProxy = profile?.proxyAddress || profile?.address;
        return officialProxy || providedFunder || signerAddress;
    } catch (e) {
        return providedFunder || signerAddress;
    }
};

export const getWalletBalance = async (proxyWallet?: string, privateKey?: string): Promise<{ balance: number; addressUsed?: string }> => {
  if (!privateKey) return { balance: 0 };
  
  try {
    const signerAddress = new ethers.Wallet(privateKey).address;
    console.log(`[BalanceCheck] Signer Address: ${signerAddress}`);
    const correctedFunder = await validateAndCorrectFunder(signerAddress, proxyWallet);
    console.log(`[BalanceCheck] Funder Used: ${correctedFunder}`);
    
    const client = await createClobClient(privateKey, correctedFunder);
    
    // Agent 4: update before get
    await client.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });
    const balanceData = await client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
    console.log(`[BalanceCheck] Raw Balance: ${balanceData.balance}`);
    
    return {
      balance: parseFloat(balanceData.balance),
      addressUsed: correctedFunder
    };
  } catch (error) {
    console.error('[getWalletBalance] ERROR:', error instanceof Error ? error.message : error);
    return { balance: 0 };
  }
};
