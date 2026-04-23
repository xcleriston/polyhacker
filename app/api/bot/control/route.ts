import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

function getUserFromRequest(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return verifyToken(authHeader.slice(7));
}

// GET: return current bot state
export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const settings = await prisma.settings.findUnique({ where: { userId: user.userId } });
  return NextResponse.json({
    botEnabled: settings?.botEnabled ?? false,
    testMode: settings?.testMode ?? true,
  });
}

// POST: toggle bot on/off
export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { botEnabled } = body;

  if (typeof botEnabled !== 'boolean') {
    return NextResponse.json({ error: 'botEnabled must be a boolean' }, { status: 400 });
  }

  const settings = await prisma.settings.upsert({
    where: { userId: user.userId },
    update: { botEnabled },
    create: {
      userId: user.userId,
      botEnabled,
      testMode: true,
    },
  });

  return NextResponse.json({ botEnabled: settings.botEnabled, testMode: settings.testMode });
}

