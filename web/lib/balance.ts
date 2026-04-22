import { ethers } from 'ethers';

const RPC_URL = process.env.RPC_URL || 'https://polygon.llamarpc.com';
const USDC_CONTRACT_ADDRESS = process.env.USDC_CONTRACT_ADDRESS || '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

const USDC_ABI = ['function balanceOf(address owner) view returns (uint256)'];

export interface BalanceResult {
  balance: number;
  addressUsed: string;
}

export async function getWalletBalance(address?: string, privateKey?: string): Promise<BalanceResult> {
  try {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, provider);
    
    let activeProxy = address?.trim();
    let signerAddress = '';
    
    // 1. If we have a private key but no proxy, try to auto-detect from Polymarket API
    if (privateKey && privateKey.length === 64) {
      try {
        const wallet = new ethers.Wallet(privateKey);
        signerAddress = wallet.address;
        
        if (!activeProxy || activeProxy === '') {
          console.log(`[BALANCE_CHECK] Auto-detecting proxy for signer: ${signerAddress}`);
          const response = await fetch(`https://clob.polymarket.com/proxy-address?signer=${signerAddress}`);
          if (response.ok) {
            const data = await response.json();
            if (data.proxy) {
              activeProxy = data.proxy;
              console.log(`[BALANCE_CHECK] Detected Proxy: ${activeProxy}`);
            }
          }
        }
      } catch (e) {
        console.error('[PROXY_DETECTION_ERROR]', e);
      }
    }

    let mainBalance = 0;
    let addressUsed = activeProxy || signerAddress || '';
    
    // 2. Check detected or provided Proxy Wallet
    if (activeProxy && activeProxy.startsWith('0x')) {
      const cleanAddress = activeProxy.trim();
      const balance = await contract.balanceOf(cleanAddress);
      mainBalance = parseFloat(ethers.utils.formatUnits(balance, 6));
      if (mainBalance > 0) return { balance: mainBalance, addressUsed: cleanAddress };
    }
    
    // 3. Fallback to Signer Wallet balance
    if (signerAddress) {
      const signerBalance = await contract.balanceOf(signerAddress);
      const formattedSigner = parseFloat(ethers.utils.formatUnits(signerBalance, 6));
      if (formattedSigner > 0) return { balance: formattedSigner, addressUsed: signerAddress };
    }
    
    return { balance: mainBalance, addressUsed };
  } catch (error) {
    console.error('[BALANCE_CHECK_ERROR]', error);
    return { balance: 0, addressUsed: address || '' };
  }
}
