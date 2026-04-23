import createClobClient from '@/polymarket/createClobClient';
import { AssetType } from '@polymarket/clob-client';
import fetchData from '@/lib/fetchData';
import { ethers } from 'ethers';

/**
 * Agent 5: Funder Validation
 */
const validateAndCorrectFunder = async (signerAddress: string, providedFunder?: string): Promise<string> => {
    // If user provided a specific proxy, trust it first
    if (providedFunder && providedFunder.toLowerCase() !== signerAddress.toLowerCase() && providedFunder.length === 42) {
        return providedFunder;
    }

    try {
        const [profile, funderData] = await Promise.allSettled([
            fetchData(`https://data-api.polymarket.com/profiles?address=${signerAddress}`),
            fetchData(`https://clob.polymarket.com/funder-address?address=${signerAddress}`)
        ]);

        let officialProxy = null;
        if (profile.status === 'fulfilled') {
            officialProxy = (profile.value as any)?.proxyAddress || (profile.value as any)?.address;
        }
        if (!officialProxy && funderData.status === 'fulfilled') {
            officialProxy = (funderData.value as any)?.funderAddress;
        }

        const finalProxy = officialProxy || providedFunder || signerAddress;
        console.log(`[BalanceCheck] Auto-detected Funder: ${finalProxy}`);
        return finalProxy;
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
    let balance = parseFloat(balanceData.balance);

    // Fallback: Direct contract check if API says 0
    if (balance === 0) {
        console.log(`[BalanceCheck] API reported 0. Checking contracts directly...`);
        const rpcUrl = process.env.RPC_URL || 'https://polygon-rpc.com';
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        const usdcAbi = ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'];
        
        const contracts = [
            { addr: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', name: 'Bridged USDC (USDC.e)' },
            { addr: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', name: 'Native USDC' }
        ];

        for (const item of contracts) {
            try {
                const contract = new ethers.Contract(item.addr, usdcAbi, provider);
                const rawBal = await contract.balanceOf(correctedFunder);
                const decimals = await contract.decimals();
                const formattedBal = parseFloat(ethers.utils.formatUnits(rawBal, decimals));
                console.log(`[BalanceCheck] ${item.name} (${item.addr}): $${formattedBal}`);
                if (formattedBal > 0) {
                    if (balance === 0) balance = formattedBal;
                    else balance += formattedBal; // Sum if funds are split
                }
            } catch (e) {
                console.error(`[BalanceCheck] Error checking ${item.name}:`, e instanceof Error ? e.message : e);
            }
        }
        console.log(`[BalanceCheck] Total Direct Balance: $${balance}`);
    }

    console.log(`[BalanceCheck] Final Balance: ${balance}`);
    
    return {
      balance,
      addressUsed: correctedFunder
    };
  } catch (error) {
    console.error('[getWalletBalance] ERROR:', error instanceof Error ? error.message : error);
    return { balance: 0 };
  }
};
