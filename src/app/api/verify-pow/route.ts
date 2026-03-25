export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

const POW_DIFFICULTY = '0000';
const POW_MAX_AGE = 60000;

export async function POST(request: NextRequest) {
  try {
    const { nonce, timestamp } = await request.json();

    if (!nonce || !timestamp) {
      return NextResponse.json({ valid: false, error: 'Missing nonce or timestamp' }, { status: 400 });
    }

    if (Date.now() - timestamp > POW_MAX_AGE) {
      return NextResponse.json({ valid: false, error: 'PoW expired' }, { status: 400 });
    }

    const [count, hash] = nonce.split('-');
    
    if (!hash || !hash.startsWith(POW_DIFFICULTY)) {
      return NextResponse.json({ valid: false, error: 'Invalid PoW' }, { status: 400 });
    }

    return NextResponse.json({ valid: true });
  } catch (error) {
    console.error('Error verifying PoW:', error);
    return NextResponse.json({ valid: false, error: 'Internal error' }, { status: 500 });
  }
}
