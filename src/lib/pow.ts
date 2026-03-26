import { NextRequest } from 'next/server';

const POW_DIFFICULTY = '0000';
const POW_MAX_AGE = 300000; // 5 minutes for Tor latency

export interface PoWVerificationResult {
  valid: boolean;
  error?: string;
  message?: string;
}

export function verifyPoW(nonce: string, timestamp: number): PoWVerificationResult {
  if (!nonce || !timestamp) {
    return { valid: false, error: 'MISSING_NONCE_OR_TIMESTAMP', message: 'Missing nonce or timestamp' };
  }

  const age = Date.now() - timestamp;
  if (age > POW_MAX_AGE) {
    return { valid: false, error: 'EXPIRED_TIMESTAMP', message: `PoW expired (age: ${age}ms)` };
  }

  if (age < -10000) {
    return { valid: false, error: 'INVALID_TIMESTAMP', message: 'Timestamp too far in future' };
  }

  const parts = nonce.split('-');
  if (parts.length !== 2) {
    return { valid: false, error: 'INVALID_FORMAT', message: 'Invalid nonce format' };
  }

  const [count, hash] = parts;
  
  if (!hash) {
    return { valid: false, error: 'MISSING_HASH', message: 'Hash missing from nonce' };
  }

  if (!hash.startsWith(POW_DIFFICULTY)) {
    return { valid: false, error: 'INVALID_HASH', message: `Hash does not start with ${POW_DIFFICULTY}` };
  }

  const countNum = parseInt(count, 10);
  if (isNaN(countNum) || countNum < 1) {
    return { valid: false, error: 'INVALID_COUNT', message: 'Invalid iteration count' };
  }

  return { valid: true };
}

export function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('cf-connecting-ip') || '127.0.0.1';
}

export { POW_DIFFICULTY, POW_MAX_AGE };