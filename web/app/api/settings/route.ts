import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/jwt';
import { ethers } from 'ethers';

async function getUserId(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);
  return payload?.userId || null;
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
    let proxyWallet = body.proxyWallet || '';
    const privateKey = body.privateKey || '';

    // Auto-detect proxyWallet if privateKey is provided and proxyWallet is empty
    if (privateKey && privateKey.length === 64 && (!proxyWallet || proxyWallet === '')) {
      try {
        const wallet = new ethers.Wallet(privateKey);
        const signerAddress = wallet.address;
        const response = await fetch(`https://clob.polymarket.com/proxy-address?signer=${signerAddress}`);
        if (response.ok) {
          const data = await response.json();
          if (data.proxy) {
            proxyWallet = data.proxy;
            console.log(`[SETTINGS_AUTO_DETECT] Found proxy ${proxyWallet} for signer ${signerAddress}`);
          }
        }
      } catch (e) {
        console.error('[SETTINGS_AUTO_DETECT_ERROR]', e);
      }
    }

    const updated = await prisma.settings.upsert({
      where: { userId },
      update: {
        copyMode: body.copyMode,
        mirrorSizeMode: body.mirrorSizeMode,
        fixedAmount: parseFloat(body.fixedAmount) || 10.0,
        copySize: parseFloat(body.copySize) || 10.0,
        proxyWallet: proxyWallet,
        privateKey: privateKey,
        dailyLossCapPct: parseFloat(body.dailyLossCapPct) || 20.0,
        telegramChatId: body.telegramChatId || '',
        testMode,
        botEnabled: typeof body.botEnabled === 'boolean' ? body.botEnabled : undefined,
      },
      create: {
        userId,
        copyMode: body.copyMode || 'NORMAL',
        mirrorSizeMode: body.mirrorSizeMode || 'PERCENTAGE',
        fixedAmount: parseFloat(body.fixedAmount) || 10.0,
        copySize: parseFloat(body.copySize) || 10.0,
        proxyWallet: proxyWallet,
        privateKey: privateKey,
        dailyLossCapPct: parseFloat(body.dailyLossCapPct) || 20.0,
        telegramChatId: body.telegramChatId || '',
        testMode,
        botEnabled: body.botEnabled || false,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[SETTINGS_POST]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
