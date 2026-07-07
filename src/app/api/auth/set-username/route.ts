export const runtime = 'edge';
import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT, signJWT, COOKIE_NAME } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const payload = await verifyJWT(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 500 });
    }

    const { username } = await request.json();
    let finalUsername = (username || '').trim();

    if (!finalUsername) {
      finalUsername = `user_${payload.walletAddress.slice(0, 8)}`;
    } else {
      if (finalUsername.length > 15) {
        return NextResponse.json({ error: 'Username must be 15 characters or less' }, { status: 400 });
      }
      if (!/^[a-zA-Z0-9_]+$/.test(finalUsername)) {
        return NextResponse.json({ error: 'Only letters, numbers, and underscores allowed' }, { status: 400 });
      }
    }

    const { error: upsertError } = await supabaseAdmin
      .from('users')
      .update({ username: finalUsername })
      .eq('wallet_address', payload.walletAddress);

    if (upsertError) {
      if (upsertError.code === '23505') {
        return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
      }
      throw upsertError;
    }

    const newToken = await signJWT(payload.walletAddress, finalUsername);

    const response = NextResponse.json({ success: true, username: finalUsername });
    response.cookies.set(COOKIE_NAME, newToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24,
    });
    return response;
  } catch (error) {
    console.error('[Auth/SetUsername] Error:', error);
    return NextResponse.json({ error: 'Failed to set username' }, { status: 500 });
  }
}
