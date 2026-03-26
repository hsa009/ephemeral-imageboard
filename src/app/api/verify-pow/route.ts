export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { verifyPoW } from '@/lib/pow';

export async function POST(request: NextRequest) {
  try {
    const { nonce, timestamp } = await request.json();

    const result = verifyPoW(nonce, timestamp);

    if (!result.valid) {
      return NextResponse.json({ valid: false, error: result.error, message: result.message }, { status: 400 });
    }

    return NextResponse.json({ valid: true });
  } catch (error) {
    console.error('Error verifying PoW:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ valid: false, error: 'INTERNAL_ERROR', message: errorMessage }, { status: 500 });
  }
}