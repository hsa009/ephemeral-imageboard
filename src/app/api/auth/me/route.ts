export const runtime = 'edge';
import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ authenticated: false });
  }
  const payload = await verifyJWT(token);
  if (!payload) {
    return NextResponse.json({ authenticated: false });
  }

  let username: string | null = null;

  if (supabaseAdmin) {
    const { data } = await supabaseAdmin
      .from('users')
      .select('username')
      .eq('wallet_address', payload.walletAddress)
      .single();
    if (data) {
      username = data.username;
    }
  }

  return NextResponse.json({
    authenticated: true,
    walletAddress: payload.walletAddress,
    hasUsername: !!username,
    username,
  });
}
