import { ethers } from 'ethers';

const RPC_URLS = [
  'https://rpc.ankr.com/polygon',
  'https://polygon-rpc.com',
  'https://polygon-mainnet.public.blastapi.io'
];

const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const USDC_NATIVE_ADDRESS = '0x3c499c542cef5e3811e1192ce70d8cC03d5c3359';
const USDC_ABI = ['function balanceOf(address owner) view returns (uint256)'];

export interface BalanceResult {
  balance: number;
  addressUsed: string;
}

export async function getWalletBalance(address?: string, privateKey?: string): Promise<BalanceResult> {
  const startTime = Date.now();
  let activeProxy = address?.trim();
  let signerAddress = '';
  
  try {
    // 1. Resolve Signer and Proxy in parallel
    if (privateKey && privateKey.length >= 64) {
      try {
        const wallet = new ethers.Wallet(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
        signerAddress = wallet.address;
        
        if (!activeProxy) {
          console.log(`[BALANCE_LOG] Auto-detecting for ${signerAddress}...`);
          const [gammaRes, dataRes] = await Promise.all([
            fetch(`https://gamma-api.polymarket.com/users/?address=${signerAddress}`).catch(() => null),
            fetch(`https://data-api.polymarket.com/profiles?address=${signerAddress}`).catch(() => null)
          ]);

          if (gammaRes?.ok) {
            const data = await gammaRes.json();
            if (data.proxyAddress) activeProxy = data.proxyAddress;
          }
          if (!activeProxy && dataRes?.ok) {
            const data = await dataRes.json();
            if (data.proxyAddress) activeProxy = data.proxyAddress;
          }
        }
      } catch (e: any) {
        console.error('[BALANCE_LOG] Proxy detection error:', e?.message || e);
      }
    }

    const targetAddr = activeProxy || signerAddress;
    if (!targetAddr || !targetAddr.startsWith('0x')) {
      return { balance: 0, addressUsed: '' };
    }

    // 2. Query Balances with RPC Rotation
    let totalBalance = 0;
    let success = false;

    for (const rpc of RPC_URLS) {
      if (success) break;
      try {
        console.log(`[BALANCE_LOG] Trying RPC: ${rpc} for ${targetAddr}`);
        const provider = new ethers.providers.JsonRpcProvider({
          url: rpc,
          timeout: 5000
        });
        
        const contractE = new ethers.Contract(USDC_E_ADDRESS, USDC_ABI, provider);
        const contractNative = new ethers.Contract(USDC_NATIVE_ADDRESS, USDC_ABI, provider);
        
        const [balE, balNative] = await Promise.all([
          contractE.balanceOf(targetAddr),
          contractNative.balanceOf(targetAddr)
        ]);
        
        const formattedE = parseFloat(ethers.utils.formatUnits(balE, 6));
        const formattedNative = parseFloat(ethers.utils.formatUnits(balNative, 6));
        totalBalance = formattedE + formattedNative;
        
        success = true;
        console.log(`[BALANCE_LOG] SUCCESS with ${rpc}: ${totalBalance} (E: ${formattedE}, N: ${formattedNative}) in ${Date.now() - startTime}ms`);
      } catch (err: any) {
        console.warn(`[BALANCE_LOG] RPC ${rpc} failed:`, err?.message || 'timeout');
      }
    }
    
    return { balance: totalBalance, addressUsed: targetAddr };
  } catch (error: any) {
    console.error('[BALANCE_LOG] Global error:', error?.message || error);
    return { balance: 0, addressUsed: address || '' };
  }
}
