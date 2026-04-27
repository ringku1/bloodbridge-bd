import { NextResponse } from 'next/server';

export function middleware(request) {
  const secret = request.cookies.get('admin_secret')?.value;
  const { pathname } = request.nextUrl;

  if (pathname === '/login') {
    if (secret) return NextResponse.redirect(new URL('/dashboard', request.url));
    return NextResponse.next();
  }

  if (!secret) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
