import { NextRequest } from 'next/server';

const POW_DIFFICULTY = '0000';
const POW_MAX_AGE = 300000;

export interface PoWVerificationResult {
  valid: boolean;
  error?: string;
  message?: string;
}

export function verifyPoW(nonce: string, timestamp: number): PoWVerificationResult {
  if (!nonce || typeof nonce !== 'string') {
    return { valid: false, error: 'MISSING_NONCE_OR_TIMESTAMP', message: 'Missing or invalid nonce' };
  }

  if (!timestamp || typeof timestamp !== 'number') {
    return { valid: false, error: 'MISSING_NONCE_OR_TIMESTAMP', message: 'Missing or invalid timestamp' };
  }

  const trimmedNonce = nonce.trim();

  const now = Date.now();
  const age = now - timestamp;
  
  if (age > POW_MAX_AGE) {
    return { valid: false, error: 'EXPIRED_TIMESTAMP', message: `PoW expired (age: ${age}ms, max: ${POW_MAX_AGE}ms)` };
  }

  if (age < -10000) {
    return { valid: false, error: 'INVALID_TIMESTAMP', message: 'Timestamp too far in future' };
  }

  const parts = trimmedNonce.split('-');
  if (parts.length !== 2) {
    console.error('[PoW] Invalid nonce format:', { nonceLength: trimmedNonce.length, partsLength: parts.length });
    return { valid: false, error: 'INVALID_FORMAT', message: 'Invalid nonce format (expected: count-hash)' };
  }

  const [countStr, hash] = parts;
  
  if (!hash || hash.length < 4) {
    return { valid: false, error: 'MISSING_HASH', message: 'Hash missing or too short in nonce' };
  }

  if (!hash.startsWith(POW_DIFFICULTY)) {
    return { valid: false, error: 'INVALID_HASH', message: `Hash does not start with ${POW_DIFFICULTY}` };
  }

  const countNum = parseInt(countStr, 10);
  if (isNaN(countNum) || countNum < 1) {
    return { valid: false, error: 'INVALID_COUNT', message: 'Invalid iteration count' };
  }

  console.log('[PoW] Verification:', { 
    hashPrefix: hash.substring(0, 4), 
    count: countNum, 
    age: `${age}ms`,
    timestampFresh: age < 60000
  });

  return { valid: true };
}

export function getClientIP(request: NextRequest): string {
  const cfIP = request.headers.get('cf-connecting-ip');
  if (cfIP) return cfIP.trim();
  
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  
  return request.headers.get('x-real-ip') || '127.0.0.1';
}

export { POW_DIFFICULTY, POW_MAX_AGE };
