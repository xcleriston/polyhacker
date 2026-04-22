import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('ph_token')?.value;
  const { pathname } = request.nextUrl;

  // Debugging logs for Railway (visible in service logs)
  console.log(`[MW] ${request.method} ${pathname} | Token: ${token ? 'PRESENT' : 'MISSING'}`);

  const isDashboard = pathname.startsWith('/dashboard');
  const isLogin = pathname === '/login' || pathname === '/register';

  if (isDashboard && !token) {
    console.log(`[MW] Redirecting unauthorized access to /login`);
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isLogin && token) {
    console.log(`[MW] Redirecting authenticated user to /dashboard`);
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/register'],
};
