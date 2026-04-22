import { ethers } from 'ethers';

const RPC_URL = process.env.RPC_URL || 'https://polygon-rpc.com';
const USDC_CONTRACT_ADDRESS = process.env.USDC_CONTRACT_ADDRESS || '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

const USDC_ABI = ['function balanceOf(address owner) view returns (uint256)'];

export async function getWalletBalance(address: string): Promise<number> {
  try {
    if (!address || !address.startsWith('0x')) return 0;
    
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, provider);
    
    const balance = await contract.balanceOf(address);
    const formattedBalance = ethers.utils.formatUnits(balance, 6);
    
    return parseFloat(formattedBalance);
  } catch (error) {
    console.error('[BALANCE_CHECK_ERROR]', error);
    return 0;
  }
}
