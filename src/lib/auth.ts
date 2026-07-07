import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-in-production-32chars');
const COOKIE_NAME = 'auth_token';
const CHALLENGE_TTL = 5 * 60 * 1000;
const JWT_EXPIRES = '24h';

export function generateChallenge(): { nonce: string; message: string } {
  const nonce = crypto.randomUUID();
  const timestamp = Date.now();
  const message = `Sign this message to authenticate with 0null\nNonce: ${nonce}\nTimestamp: ${timestamp}`;
  return { nonce, message };
}

export function verifyChallenge(challenge: string): { valid: boolean; error?: string } {
  const nonceMatch = challenge.match(/Nonce: ([a-f0-9-]+)/);
  const timestampMatch = challenge.match(/Timestamp: (\d+)/);
  if (!nonceMatch || !timestampMatch) {
    return { valid: false, error: 'Invalid challenge format' };
  }
  const timestamp = parseInt(timestampMatch[1]);
  if (Date.now() - timestamp > CHALLENGE_TTL) {
    return { valid: false, error: 'Challenge expired' };
  }
  return { valid: true };
}

export async function signJWT(walletAddress: string): Promise<string> {
  return new SignJWT({ walletAddress })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRES)
    .sign(JWT_SECRET);
}

export async function verifyJWT(token: string): Promise<{ walletAddress: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return { walletAddress: payload.walletAddress as string };
  } catch {
    return null;
  }
}

export { COOKIE_NAME };
