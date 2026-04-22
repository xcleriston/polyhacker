const axios = require('axios');

async function checkBalance() {
  const url = 'https://polygon-rpc.com';
  const ADDRESS = '0x338d21d48a6e2c38a0cb3c530418bdbb7f40eedf';
  const USDC_E = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174';
  
  // ABI encode for balanceOf(address)
  // 70a08231 + 000000000000000000000000 + address(without 0x)
  const data = `0x70a08231000000000000000000000000${ADDRESS.slice(2)}`;
  
  try {
    const response = await axios.post(url, {
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [{ to: USDC_E, data: data }, 'latest'],
      id: 1
    });
    
    if (response.data.error) {
      console.error('RPC Error:', response.data.error);
    } else {
      const hexBalance = response.data.result;
      const balance = parseInt(hexBalance, 16) / 1000000;
      console.log(`USDC.e Balance for ${ADDRESS}: $${balance.toFixed(2)}`);
    }
  } catch (error) {
    console.error('HTTP Error:', error.message);
  }
}

checkBalance();
