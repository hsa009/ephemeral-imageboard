export const runtime = 'edge';
import { NextRequest, NextResponse } from 'next/server';
import { verifyPoW } from '@/lib/pow';
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nonce, timestamp } = body;
    // Debug: log incoming request
    console.log('[Verify-PoW] Request:', { 
      noncePrefix: nonce?.substring(0, 10) || 'none',
      timestamp,
      hasNonce: !!nonce,
      hasTimestamp: !!timestamp
    });
    if (!nonce || !timestamp) {
      console.error('[Verify-PoW] Missing required fields');
      return NextResponse.json({ 
        valid: false, 
        error: 'MISSING_FIELDS', 
        message: 'Missing nonce or timestamp' 
      }, { status: 400 });
    }
    const result = verifyPoW(nonce, timestamp);
    if (!result.valid) {
      console.error('[Verify-PoW] Verification failed:', result.error, result.message);
      return NextResponse.json({ 
        valid: false, 
        error: result.error, 
        message: result.message 
      }, { status: 400 });
    }
    console.log('[Verify-PoW] Success!');
    return NextResponse.json({ valid: true });
    
  } catch (error) {
    console.error('[Verify-PoW] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ 
      valid: false, 
      error: 'INTERNAL_ERROR', 
      message: errorMessage 
    }, { status: 500 });
  }
}
