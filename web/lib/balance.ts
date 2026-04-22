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
  const startTime = Date.now();
  try {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const contractE = new ethers.Contract(USDC_E_ADDRESS, USDC_ABI, provider);
    const contractNative = new ethers.Contract(USDC_NATIVE_ADDRESS, USDC_ABI, provider);
    
    let activeProxy = address?.trim();
    let signerAddress = '';
    
    // 1. Resolve Signer and Proxy in parallel if possible
    if (privateKey && privateKey.length >= 64) {
      try {
        const wallet = new ethers.Wallet(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
        signerAddress = wallet.address;
        
        if (!activeProxy) {
          console.log(`[BALANCE_LOG] Auto-detecting for ${signerAddress}...`);
          // Try both APIs in parallel
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
        console.error('[BALANCE_LOG] Signer/Proxy error:', e?.message || e);
      }
    }

    const targetAddr = activeProxy || signerAddress;
    if (!targetAddr || !targetAddr.startsWith('0x')) {
      return { balance: 0, addressUsed: '' };
    }

    // 2. Query both USDC balances in parallel
    console.log(`[BALANCE_LOG] Querying balance for ${targetAddr}...`);
    const [balE, balNative] = await Promise.all([
      contractE.balanceOf(targetAddr).catch(() => ethers.BigNumber.from(0)),
      contractNative.balanceOf(targetAddr).catch(() => ethers.BigNumber.from(0))
    ]);
    
    const formattedE = parseFloat(ethers.utils.formatUnits(balE, 6));
    const formattedNative = parseFloat(ethers.utils.formatUnits(balNative, 6));
    const total = formattedE + formattedNative;
    
    console.log(`[BALANCE_LOG] Result: ${total} (E: ${formattedE}, N: ${formattedNative}) in ${Date.now() - startTime}ms`);
    
    return { balance: total, addressUsed: targetAddr };
  } catch (error: any) {
    console.error('[BALANCE_LOG] Global error:', error?.message || error);
    return { balance: 0, addressUsed: address || '' };
  }
}
