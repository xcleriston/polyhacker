import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import { getWalletBalance } from '@/lib/balance';

function getUserFromRequest(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return verifyToken(authHeader.slice(7));
}

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [traderCount, recentTrades, settings, dbUser, totalUsers] = await Promise.all([
    prisma.trader.count({ where: { userId: user.userId, active: true } }),
    prisma.trade.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.settings.findUnique({ where: { userId: user.userId } }),
    prisma.user.findUnique({ where: { id: user.userId } }),
    prisma.user.count()
  ]);

  // Fetch balance if proxyWallet or privateKey exists
  let walletBalance = 0;
  let walletAddressUsed = '';
  if (settings?.proxyWallet || settings?.privateKey) {
    const result = await getWalletBalance(settings?.proxyWallet || undefined, settings?.privateKey || undefined);
    walletBalance = result.balance;
    walletAddressUsed = result.addressUsed;
  }

  // Self-heal: Make the first/only user an Admin and Active automatically
  // Also auto-activate the primary admin email for convenience
  let role = dbUser?.role || 'USER';
  let active = dbUser?.active || false;
  
  const isPrimaryAdmin = dbUser?.email === 'admin@polyhacker.com';

  if ((totalUsers === 1 || isPrimaryAdmin) && (role !== 'ADMIN' || !active)) {
    await prisma.user.update({
      where: { id: user.userId },
      data: { role: 'ADMIN', active: true }
    });
    role = 'ADMIN';
    active = true;
  }

  const isConfigured = settings && settings.privateKey && settings.privateKey.length === 64;

  return NextResponse.json({
    activeTraders: traderCount,
    recentTrades,
    walletBalance,
    walletAddressUsed,
    botStatus: isConfigured ? 'running' : 'stopped',
    userRole: role,
    userActive: isPrimaryAdmin ? true : active // Emergency bypass for primary admin
  });
}
