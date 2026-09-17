import { NextRequest } from 'next/server';

export async function hashIP(ip: string): Promise<string> {
  const rawSalt = process.env.IP_SALT || '';
  const salt = rawSalt.trim() || 'default_salt_change_me';
  
  console.log('[IP-Hash] Salt prefix:', salt.substring(0, 4), '| Salt length:', salt.length);
  
  const combined = `${ip.trim()}:${salt}`;
  
  const encoder = new TextEncoder();
  const encoded = encoder.encode(combined);
  const buf = new Uint8Array(encoded.length);
  buf.set(encoded);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', buf);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 10);
  
  console.log('[IP-Hash] IP:', ip, '| Hash:', hash);
  
  return hash;
}

export function getClientIP(request: NextRequest): string {
  const cfIP = request.headers.get('cf-connecting-ip');
  if (cfIP) {
    const ip = cfIP.trim();
    console.log('[IP-Hash] Using CF-Connecting-IP:', ip);
    return ip;
  }
  
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const ip = forwarded.split(',')[0].trim();
    console.log('[IP-Hash] Using x-forwarded-for:', ip);
    return ip;
  }
  
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    console.log('[IP-Hash] Using x-real-ip:', realIP);
    return realIP.trim();
  }
  
  console.log('[IP-Hash] No IP header found, using default');
  return '127.0.0.1';
}
