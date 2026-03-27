import { NextRequest } from 'next/server';

export async function hashIP(ip: string): Promise<string> {
  // Get salt and trim it to handle Cloudflare dashboard whitespace
  const rawSalt = process.env.IP_SALT || '';
  const salt = rawSalt.trim() || 'default_salt_change_me';
  
  // Debug: log salt prefix (never log full salt)
  console.log('[IP-Hash] Salt prefix:', salt.substring(0, 4), '| Salt length:', salt.length);
  
  // Combine IP and salt
  const combined = `${ip.trim()}:${salt}`;
  
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 10);
  
  console.log('[IP-Hash] IP:', ip, '| Hash:', hash);
  
  return hash;
}

export function getClientIP(request: NextRequest): string {
  // Cloudflare Edge priority: CF-Connecting-IP (most reliable)
  const cfIP = request.headers.get('cf-connecting-ip');
  if (cfIP) {
    const ip = cfIP.trim();
    console.log('[IP-Hash] Using CF-Connecting-IP:', ip);
    return ip;
  }
  
  // Fallback for other CDNs/proxies
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const ip = forwarded.split(',')[0].trim();
    console.log('[IP-Hash] Using x-forwarded-for:', ip);
    return ip;
  }
  
  // nginx/other proxies
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    console.log('[IP-Hash] Using x-real-ip:', realIP);
    return realIP.trim();
  }
  
  console.log('[IP-Hash] No IP header found, using default');
  return '127.0.0.1';
}
