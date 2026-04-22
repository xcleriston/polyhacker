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
    
    let mainBalance = 0;
    let addressUsed = address?.trim() || '';
    
    // 1. Check Proxy Wallet first if provided
    if (address && address.trim().startsWith('0x')) {
      const cleanAddress = address.trim();
      console.log(`[BALANCE_CHECK] Checking Proxy: ${cleanAddress}`);
      const balance = await contract.balanceOf(cleanAddress);
      mainBalance = parseFloat(ethers.utils.formatUnits(balance, 6));
      console.log(`[BALANCE_CHECK] Proxy Balance: ${mainBalance}`);
      if (mainBalance > 0) return { balance: mainBalance, addressUsed: cleanAddress };
    }
    
    // 2. If proxy balance is 0 and we have a private key, check the signer wallet balance
    if (privateKey && privateKey.length === 64) {
      try {
        const wallet = new ethers.Wallet(privateKey);
        console.log(`[BALANCE_CHECK] Checking Signer: ${wallet.address}`);
        const signerBalance = await contract.balanceOf(wallet.address);
        const formattedSigner = parseFloat(ethers.utils.formatUnits(signerBalance, 6));
        console.log(`[BALANCE_CHECK] Signer Balance: ${formattedSigner}`);
        if (formattedSigner > 0) return { balance: formattedSigner, addressUsed: wallet.address };
        // If both 0, we'll return the proxy address as "address used" or the signer if proxy was missing
        if (!addressUsed) addressUsed = wallet.address;
      } catch (e) {
        console.error('[SIGNER_BALANCE_ERROR]', e);
      }
    }
    
    return { balance: mainBalance, addressUsed };
  } catch (error) {
    console.error('[BALANCE_CHECK_ERROR]', error);
    return { balance: 0, addressUsed: address || '' };
  }
}
