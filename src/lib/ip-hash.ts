import { NextRequest } from 'next/server';

export async function hashIP(ip: string): Promise<string> {
  const salt = (process.env.IP_SALT || 'default_salt_change_me').trim();
  const combined = `${ip}:${salt}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 10);
}

export function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('cf-connecting-ip') || '127.0.0.1';
}