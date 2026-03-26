export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

const POW_DIFFICULTY = '0000';
const POW_MAX_AGE = 300000; // 5 minutes for Tor latency

export async function POST(request: NextRequest) {
  try {
    const { nonce, timestamp } = await request.json();

    if (!nonce || !timestamp) {
      return NextResponse.json({ valid: false, error: 'MISSING_NONCE_OR_TIMESTAMP', message: 'Missing nonce or timestamp' }, { status: 400 });
    }

    const age = Date.now() - timestamp;
    if (age > POW_MAX_AGE) {
      return NextResponse.json({ valid: false, error: 'EXPIRED_TIMESTAMP', message: `PoW expired (age: ${age}ms)` }, { status: 400 });
    }

    if (age < -10000) {
      return NextResponse.json({ valid: false, error: 'INVALID_TIMESTAMP', message: 'Timestamp too far in future' }, { status: 400 });
    }

    const parts = nonce.split('-');
    if (parts.length !== 2) {
      return NextResponse.json({ valid: false, error: 'INVALID_FORMAT', message: 'Invalid nonce format' }, { status: 400 });
    }

    const [count, hash] = parts;
    
    if (!hash) {
      return NextResponse.json({ valid: false, error: 'MISSING_HASH', message: 'Hash missing from nonce' }, { status: 400 });
    }

    if (!hash.startsWith(POW_DIFFICULTY)) {
      return NextResponse.json({ valid: false, error: 'INVALID_HASH', message: `Hash does not start with ${POW_DIFFICULTY}` }, { status: 400 });
    }

    // Verify the count is a valid number
    const countNum = parseInt(count, 10);
    if (isNaN(countNum) || countNum < 1) {
      return NextResponse.json({ valid: false, error: 'INVALID_COUNT', message: 'Invalid iteration count' }, { status: 400 });
    }

    return NextResponse.json({ valid: true });
  } catch (error) {
    console.error('Error verifying PoW:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ valid: false, error: 'INTERNAL_ERROR', message: errorMessage }, { status: 500 });
  }
}