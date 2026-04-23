import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const settingsCount = await prisma.settings.count();
    console.log(`Settings count: ${settingsCount}`);
    
    const settings = await prisma.settings.findFirst();
    if (settings) {
      console.log('Found settings:');
      console.log(`- UserID: ${settings.userId}`);
      console.log(`- ProxyWallet: ${settings.proxyWallet ? 'Set' : 'Not Set'}`);
      console.log(`- PrivateKey: ${settings.privateKey ? (settings.privateKey.length === 64 ? 'Valid Length' : 'Invalid Length') : 'Not Set'}`);
    } else {
      console.log('No settings found in database.');
    }
  } catch (error) {
    console.error('Error checking database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
