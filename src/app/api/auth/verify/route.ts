export const runtime = 'edge';
import { NextRequest, NextResponse } from 'next/server';
import { verifyChallenge, signJWT, COOKIE_NAME } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

export async function POST(request: NextRequest) {
  try {
    const { publicKey, signature, challenge } = await request.json();

    if (!publicKey || !signature || !challenge) {
      return NextResponse.json({ error: 'Missing publicKey, signature, or challenge' }, { status: 400 });
    }

    const challengeResult = verifyChallenge(challenge);
    if (!challengeResult.valid) {
      return NextResponse.json({ error: challengeResult.error || 'Invalid challenge' }, { status: 400 });
    }

    const messageBytes = new TextEncoder().encode(challenge);
    const signatureBytes = bs58.decode(signature);
    const publicKeyBytes = bs58.decode(publicKey);

    const verified = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    if (!verified) {
      return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 500 });
    }

    let hasUsername = false;
    let username: string | null = null;

    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('username')
      .eq('wallet_address', publicKey)
      .single();

    if (existing) {
      if (existing.username) {
        hasUsername = true;
        username = existing.username;
      }
    } else {
      await supabaseAdmin
        .from('users')
        .insert({ wallet_address: publicKey });
    }

    const token = await signJWT(publicKey, username || undefined);

    const response = NextResponse.json({ success: true, walletAddress: publicKey, hasUsername, username });
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24,
    });
    return response;
  } catch (error) {
    console.error('[Auth/Verify] Error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
