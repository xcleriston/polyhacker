const { ethers } = require('ethers');

async function checkBalance() {
  const RPC_URL = 'https://rpc.ankr.com/polygon';
  const USDC_CONTRACT = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
  const ADDRESS = '0x338d21D48A6e2C38A0Cb3C530418BDBB7f40eeDF'.toLowerCase();
  const USDC_NATIVE = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
  
  try {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const abi = ['function balanceOf(address owner) view returns (uint256)'];
    
    // Check USDC.e (Bridged)
    const contractE = new ethers.Contract(USDC_CONTRACT, abi, provider);
    const balanceE = await contractE.balanceOf(ADDRESS);
    console.log(`USDC.e Balance: ${ethers.utils.formatUnits(balanceE, 6)}`);

    // Check USDC (Native)
    const contractNative = new ethers.Contract(USDC_NATIVE, abi, provider);
    const balanceNative = await contractNative.balanceOf(ADDRESS);
    console.log(`USDC Native Balance: ${ethers.utils.formatUnits(balanceNative, 6)}`);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkBalance();
