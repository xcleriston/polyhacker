const { ethers } = require('ethers');

async function checkBalance() {
  const RPCS = [
    'https://polygon.llamarpc.com',
    'https://rpc.ankr.com/polygon',
    'https://polygon-mainnet.public.blastapi.io'
  ];
  const USDC_CONTRACT = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
  const ADDRESS = '0x338d21D48A6e2C38A0Cb3C530418BDBB7f40eeDF';
  
  for (const rpc of RPCS) {
    try {
      console.log(`Trying RPC: ${rpc}`);
      const provider = new ethers.providers.JsonRpcProvider(rpc);
      const abi = ['function balanceOf(address owner) view returns (uint256)'];
      const contract = new ethers.Contract(USDC_CONTRACT, abi, provider);
      
      const balance = await contract.balanceOf(ADDRESS.toLowerCase());
      console.log(`SUCCESS! USDC.e Balance: ${ethers.utils.formatUnits(balance, 6)}`);
      return;
    } catch (error) {
      console.error(`Failed ${rpc}: ${error.message}`);
    }
  }
}

checkBalance();
