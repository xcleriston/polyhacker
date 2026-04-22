import { ethers } from 'ethers';

const RPC_URL = process.env.RPC_URL || 'https://polygon-mainnet.public.blastapi.io';
const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const USDC_NATIVE_ADDRESS = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';

const USDC_ABI = ['function balanceOf(address owner) view returns (uint256)'];

export interface BalanceResult {
  balance: number;
  addressUsed: string;
}

export async function getWalletBalance(address?: string, privateKey?: string): Promise<BalanceResult> {
  try {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const contractE = new ethers.Contract(USDC_E_ADDRESS, USDC_ABI, provider);
    const contractNative = new ethers.Contract(USDC_NATIVE_ADDRESS, USDC_ABI, provider);
    
    let activeProxy = address?.trim();
    let signerAddress = '';
    
    // 1. Auto-detect proxy from private key if needed
    if (privateKey && privateKey.length === 64) {
      try {
        const wallet = new ethers.Wallet(privateKey);
        signerAddress = wallet.address;
        
        if (!activeProxy || activeProxy === '') {
          // Try Gamma API (sometimes it works on different mirrors)
          const gammaRes = await fetch(`https://gamma-api.polymarket.com/users/?address=${signerAddress}`);
          if (gammaRes.ok) {
            const data = await gammaRes.json();
            if (data.proxyAddress) activeProxy = data.proxyAddress;
          }
        }
      } catch (e) {
        console.error('[PROXY_DETECTION_ERROR]', e);
      }
    }

    let totalBalance = 0;
    const addressToQuery = activeProxy || signerAddress;
    
    if (addressToQuery && addressToQuery.startsWith('0x')) {
      const cleanAddr = addressToQuery.trim();
      try {
        // Query both contracts in parallel
        const [balE, balNative] = await Promise.all([
          contractE.balanceOf(cleanAddr),
          contractNative.balanceOf(cleanAddr)
        ]);
        
        const formattedE = parseFloat(ethers.utils.formatUnits(balE, 6));
        const formattedNative = parseFloat(ethers.utils.formatUnits(balNative, 6));
        
        totalBalance = formattedE + formattedNative;
        console.log(`[BALANCE] ${cleanAddr} -> USDC.e: ${formattedE}, Native: ${formattedNative}, Total: ${totalBalance}`);
      } catch (e) {
        console.error('[CONTRACT_QUERY_ERROR]', e);
      }
    }
    
    return { balance: totalBalance, addressUsed: addressToQuery || '' };
  } catch (error) {
    console.error('[BALANCE_CHECK_ERROR]', error);
    return { balance: 0, addressUsed: address || '' };
  }
}
