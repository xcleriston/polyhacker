
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const settings = await prisma.settings.findMany();
  console.log('--- SETTINGS ---');
  console.log(JSON.stringify(settings, (key, value) => 
    key === 'privateKey' ? 'MASKED' : value, 2));
    
  const traders = await prisma.targetTrader.findMany();
  console.log('\n--- TARGET TRADERS ---');
  console.log(JSON.stringify(traders, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
