import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'railway_secret_polyhacker_99';

async function getUserId(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    return decoded.userId;
  } catch (error) {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const settings = await prisma.settings.findUnique({
      where: { userId },
    });

    if (!settings) {
      return NextResponse.json({
        copyMode: 'NORMAL',
        mirrorSizeMode: 'PERCENTAGE',
        fixedAmount: 10.0,
        copySize: 10.0,
        proxyWallet: '',
        privateKey: '',
        dailyLossCapPct: 20.0,
        telegramChatId: '',
        testMode: true,
      });
    }

    return NextResponse.json(settings);
  } catch (error) {
    console.error('[SETTINGS_GET]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const testMode = typeof body.testMode === 'boolean' ? body.testMode : true;

    const updated = await prisma.settings.upsert({
      where: { userId },
      update: {
        copyMode: body.copyMode,
        mirrorSizeMode: body.mirrorSizeMode,
        fixedAmount: parseFloat(body.fixedAmount) || 10.0,
        copySize: parseFloat(body.copySize) || 10.0,
        proxyWallet: body.proxyWallet || '',
        privateKey: body.privateKey || '',
        dailyLossCapPct: parseFloat(body.dailyLossCapPct) || 20.0,
        telegramChatId: body.telegramChatId || '',
        testMode,
      },
      create: {
        userId,
        copyMode: body.copyMode || 'NORMAL',
        mirrorSizeMode: body.mirrorSizeMode || 'PERCENTAGE',
        fixedAmount: parseFloat(body.fixedAmount) || 10.0,
        copySize: parseFloat(body.copySize) || 10.0,
        proxyWallet: body.proxyWallet || '',
        privateKey: body.privateKey || '',
        dailyLossCapPct: parseFloat(body.dailyLossCapPct) || 20.0,
        telegramChatId: body.telegramChatId || '',
        testMode,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[SETTINGS_POST]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
