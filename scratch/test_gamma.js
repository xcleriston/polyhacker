const axios = require('axios');

async function test() {
  const address = '0x338d21D48A6e2C38A0Cb3C530418BDBB7f40eeDF';
  try {
    const url = `https://gamma-api.polymarket.com/users/?address=${address}`;
    console.log(`Querying: ${url}`);
    const response = await axios.get(url);
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Data:', error.response.data);
    }
  }
}

test();
