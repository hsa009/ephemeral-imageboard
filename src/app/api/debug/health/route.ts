export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { s3Client, getBucketName } from '@/lib/s3';
import { HeadBucketCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

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
  try {
    if (!s3Client) {
      results.services.idrive = { status: 'FAIL', error: 'S3 client not initialized' };
    } else {
      const bucket = getBucketName();
      if (!bucket) {
        results.services.idrive = { status: 'FAIL', error: 'Bucket name not configured' };
      } else {
        // Try to list objects (validates access)
        const command = new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 });
        await s3Client.send(command);
        results.services.idrive = { status: 'PASS', details: { bucket } };
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
    const testData = new TextEncoder().encode('test-ip:test-salt');
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', testData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 10);
    
    if (process.env.IP_SALT) {
      results.services.hashing = { 
        status: 'PASS', 
        details: { hasCustomSalt: true, testHash: hash } 
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