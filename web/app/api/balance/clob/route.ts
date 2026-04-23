import { NextRequest, NextResponse } from 'next/server';
import createClobClient from '@/lib/createClobClient';
import { verifyToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
    try {
        const authHeader = req.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = verifyToken(authHeader.slice(7));
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const settings = await prisma.settings.findUnique({ where: { userId: token.userId } });
        if (!settings || !settings.privateKey) {
            return NextResponse.json({ balance: 0 });
        }

        const client = await createClobClient(settings.privateKey, settings.proxyWallet || undefined);
        const balanceData = await client.getBalanceAllowance({ asset_type: 'COLLATERAL' as any });
        
        return NextResponse.json({
            balance: parseFloat(balanceData.balance),
            addressUsed: settings.proxyWallet || client.address
        });
    } catch (error) {
        console.error('[API_BALANCE_CLOB]', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
