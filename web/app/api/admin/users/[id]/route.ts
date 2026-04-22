import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

async function checkAdmin(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  
  const token = verifyToken(authHeader.slice(7));
  if (!token) return null;

  const user = await prisma.user.findUnique({ where: { id: token.userId } });
  if (!user || user.role !== 'ADMIN') return null;

  return user;
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const adminUser = await checkAdmin(req);
    if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { email, password, name, role, active } = body;

    const data: any = {};
    if (email) data.email = email;
    if (name !== undefined) data.name = name;
    if (role) data.role = role;
    if (active !== undefined) data.active = active;
    
    if (password) {
      if (password.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
      }
      data.password = await bcrypt.hash(password, 12);
    }

    const updatedUser = await prisma.user.update({
      where: { id: params.id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        createdAt: true,
      }
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('[ADMIN_USER_PUT]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const adminUser = await checkAdmin(req);
    if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (adminUser.id === params.id) {
      return NextResponse.json({ error: 'Cannot delete your own admin account' }, { status: 400 });
    }

    await prisma.user.delete({
      where: { id: params.id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[ADMIN_USER_DELETE]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
