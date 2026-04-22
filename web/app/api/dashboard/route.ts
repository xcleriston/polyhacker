import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

function getUserFromRequest(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return verifyToken(authHeader.slice(7));
}

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [traderCount, recentTrades, settings] = await Promise.all([
    prisma.trader.count({ where: { userId: user.userId, active: true } }),
    prisma.trade.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.settings.findUnique({ where: { userId: user.userId } }),
  ]);

  const isConfigured = settings && settings.privateKey && settings.privateKey.length === 64;

  return NextResponse.json({
    activeTraders: traderCount,
    recentTrades,
    botStatus: isConfigured ? 'running' : 'stopped',
  });
}
