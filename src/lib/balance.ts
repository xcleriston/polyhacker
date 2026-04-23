import createClobClient from '@/polymarket/createClobClient';
import { AssetType } from '@polymarket/clob-client';

export const getWalletBalance = async (proxyWallet?: string, privateKey?: string): Promise<{ balance: number; addressUsed?: string }> => {
  if (!privateKey) return { balance: 0 };
  
  try {
    const client = await createClobClient(privateKey, proxyWallet || undefined);
    const balanceData = await client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
    
    return {
      balance: parseFloat(balanceData.balance),
      addressUsed: proxyWallet || (client as any).address // Fallback if address is needed
    };
  } catch (error) {
    console.error('[getWalletBalance]', error);
    return { balance: 0 };
  }
};
