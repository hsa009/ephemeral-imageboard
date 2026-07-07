export const runtime = 'edge';
import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ authenticated: false });
  }
  const payload = await verifyJWT(token);
  if (!payload) {
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({ authenticated: true, walletAddress: payload.walletAddress });
}
