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
    
    // Clean and validate private key
    let privateKey = (body.privateKey || '').trim();
    if (privateKey.startsWith('0x')) {
      privateKey = privateKey.slice(2);
    }
    
    let proxyWallet = (body.proxyWallet || '').trim();

    // Force auto-detect proxyWallet from privateKey if valid key is provided
    if (privateKey && (privateKey.length === 64 || privateKey.length === 66)) {
      const finalKey = privateKey.length === 66 && privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
      
      try {
        const wallet = new ethers.Wallet(finalKey);
        const signerAddress = wallet.address;
        
        console.log(`[SETTINGS_LOG] Private Key derived Signer: ${signerAddress}`);
        
        // Try multiple endpoints
        let detectedProxy = '';
        
        // 1. Gamma API
        try {
          const res = await fetch(`https://gamma-api.polymarket.com/users/?address=${signerAddress}`);
          if (res.ok) {
            const data = await res.json();
            if (data.proxyAddress) detectedProxy = data.proxyAddress;
          }
        } catch (e) {}

        // 2. Data API Profile
        if (!detectedProxy) {
          try {
            const res = await fetch(`https://data-api.polymarket.com/profiles?address=${signerAddress}`);
            if (res.ok) {
              const data = await res.json();
              if (data.proxyAddress) detectedProxy = data.proxyAddress;
              else if (data.address) detectedProxy = data.address;
            }
          } catch (e) {}
        }

        // 3. CLOB API Funder (Specific endpoint for some accounts)
        if (!detectedProxy) {
          try {
            const res = await fetch(`https://clob.polymarket.com/funder-address?signer=${signerAddress}`);
            if (res.ok) {
              const data = await res.json();
              if (data.funderAddress) detectedProxy = data.funderAddress;
            }
          } catch (e) {}
        }

        if (detectedProxy) {
          proxyWallet = detectedProxy;
          console.log(`[SETTINGS_LOG] Successfully auto-detected proxy: ${proxyWallet}`);
        } else {
          console.log(`[SETTINGS_LOG] Auto-detection failed for signer ${signerAddress}. Polymarket APIs returned no proxy.`);
        }
      } catch (e) {
        console.error('[SETTINGS_LOG] Error during detection:', e.message);
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
