import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/jwt';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const userCount = await prisma.user.count();
    const isFirstUser = userCount === 0;

    const user = await prisma.user.create({
      data: { 
        email, 
        password: hashedPassword,
        role: isFirstUser ? 'ADMIN' : 'USER',
        active: isFirstUser ? true : false,
      },
    });

    const token = signToken({ userId: user.id, email: user.email });

    return NextResponse.json(
      { token, user: { id: user.id, email: user.email } },
      { status: 201 }
    );
  } catch (error) {
    console.error('[REGISTER]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

