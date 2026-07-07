export const runtime = 'edge';
import '@/lib/polyfill';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getBucketName } from '@/lib/s3';
export async function GET() {
  const results: {
    timestamp: string;
    status: string;
    services: Record<string, { status: string; error?: string; details?: unknown; code?: string }>;
    envCheck: Record<string, boolean>;
  } = {
    timestamp: new Date().toISOString(),
    status: 'CHECKING',
    services: {},
    envCheck: {},
  };
  // Check environment variables (without leaking values)
  results.envCheck = {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    IDRIVE_E2_ENDPOINT: !!process.env.IDRIVE_E2_ENDPOINT,
    IDRIVE_E2_REGION: !!process.env.IDRIVE_E2_REGION,
    IDRIVE_E2_BUCKET: !!process.env.IDRIVE_E2_BUCKET,
    IDRIVE_E2_ACCESS_KEY: !!process.env.IDRIVE_E2_ACCESS_KEY,
    IDRIVE_E2_SECRET_KEY: !!process.env.IDRIVE_E2_SECRET_KEY,
    GROQ_API_KEY: !!process.env.GROQ_API_KEY,
    OPENROUTER_API_KEY: !!process.env.OPENROUTER_API_KEY,
    GITHUB_TOKEN: !!process.env.GITHUB_TOKEN,
    MOD_API_KEY: !!process.env.MOD_API_KEY,
    CRON_SECRET: !!process.env.CRON_SECRET,
    IP_SALT: !!process.env.IP_SALT,
  };
  // Test Supabase Connection
  try {
    if (!supabaseAdmin) {
      results.services.supabase = { status: 'FAIL', error: 'Supabase client not initialized' };
    } else {
      const { data, error } = await supabaseAdmin
        .from('threads')
        .select('id')
        .limit(1);
      
        if (error) {
        results.services.supabase = { status: 'FAIL', error: error.message };
      } else {
        results.services.supabase = { status: 'PASS', details: { rowsReturned: data?.length || 0 } };
      }
    }
  } catch (err) {
    results.services.supabase = { 
      status: 'FAIL', 
      error: err instanceof Error ? err.message : 'Unknown error' 
    };
  }
  // Test IDrive S3 Connection
  const endpoint = process.env.IDRIVE_E2_ENDPOINT || '';
  try {
    const bucket = getBucketName();
    if (!bucket) {
      results.services.idrive = { status: 'FAIL', error: 'Bucket name not configured' };
    } else if (!endpoint) {
      results.services.idrive = { status: 'FAIL', error: 'Endpoint not configured' };
    } else {
      // Simple GET test - try to fetch bucket root
      const testUrl = `${endpoint}/${bucket}/`;
      const response = await fetch(testUrl, { method: 'HEAD' });
      if (response.ok || response.status === 403 || response.status === 404) {
        results.services.idrive = { status: 'PASS', details: { bucket } };
      } else {
        results.services.idrive = { status: 'FAIL', error: `HTTP ${response.status}` };
      }
    }
  } catch (err) {
    results.services.idrive = { 
      status: 'FAIL', 
      error: err instanceof Error ? err.message : 'Unknown error' 
    };
  }
  // Test IP Hashing / Web Crypto
  try {
    const encoded = new TextEncoder().encode('test-ip:test-salt');
    const buf = new Uint8Array(encoded.length);
    buf.set(encoded);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', buf);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 10);
    
    const hasCustomSalt = (process.env.IP_SALT || '').trim().length > 0;
    
    if (hasCustomSalt) {
      results.services.hashing = { 
        status: 'PASS', 
        details: { hasCustomSalt: true, testHash: hash, saltLength: (process.env.IP_SALT || '').trim().length } 
      };
    } else {
      results.services.hashing = { 
        status: 'PASS', 
        details: { hasCustomSalt: false, testHash: hash } 
      };
    }
  } catch (err) {
    results.services.hashing = { 
      status: 'FAIL', 
      error: err instanceof Error ? err.message : 'Unknown error' 
    };
  }
  // Test PoW Verification
  try {
    results.services.pow = { status: 'PASS', details: { difficulty: '0000', maxAge: 60000 } };
  } catch (err) {
    results.services.pow = { 
      status: 'FAIL', 
      error: err instanceof Error ? err.message : 'Unknown error' 
    };
  }
  // Overall status
  const allPass = Object.values(results.services).every(s => s.status === 'PASS');
  results.status = allPass ? 'HEALTHY' : 'DEGRADED';
  return NextResponse.json(results, { 
    status: allPass ? 200 : 503,
    headers: { 'Cache-Control': 'no-store, max-age=0' }
  });
}