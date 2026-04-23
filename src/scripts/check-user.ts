import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUser() {
    try {
        const user = await prisma.user.findUnique({
            where: { email: 'xcleriston@gmail.com' },
            include: { settings: true }
        });

        if (!user) {
            console.log('User not found');
            return;
        }

        console.log('User Found:');
        console.log(`- ID: ${user.id}`);
        console.log(`- Email: ${user.email}`);
        console.log(`- Active: ${user.active}`);
        
        if (user.settings) {
            console.log('Settings:');
            console.log(`- Proxy Wallet: ${user.settings.proxyWallet}`);
            console.log(`- Private Key: ${user.settings.privateKey ? 'PRESENT' : 'MISSING'}`);
            if (user.settings.privateKey) {
                // Try to derive address from private key
                try {
                    const { ethers } = await import('ethers');
                    const wallet = new ethers.Wallet(user.settings.privateKey);
                    console.log(`- Derived EOA Address: ${wallet.address}`);
                } catch (e) {
                    console.log('- Derived EOA Address: ERROR (Invalid Key?)');
                }
            }
        } else {
            console.log('Settings: NOT CONFIGURED');
        }

        const traders = await prisma.trader.findMany({
            where: { userId: user.id }
        });
        console.log(`Target Traders (${traders.length}):`);
        traders.forEach(t => console.log(`- ${t.walletAddress} (Active: ${t.active})`));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkUser();
