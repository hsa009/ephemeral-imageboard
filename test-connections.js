require('dotenv').config();

const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const endpoint = process.env.IDRIVE_E2_ENDPOINT || 'https://s3.us-west-1.idrivee2.com';
const region = process.env.IDRIVE_E2_REGION || 'us-west-1';
const accessKeyId = process.env.IDRIVE_E2_ACCESS_KEY || '';
const secretAccessKey = process.env.IDRIVE_E2_SECRET_KEY || '';
const bucket = process.env.IDRIVE_E2_BUCKET || 'myboard';

const supabaseUrl = process.env.SUPABASE_URL || 'https://celzxbidpfolcjujqwdm.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const s3Client = new S3Client({
  endpoint,
  region,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true
});

async function testConnections() {
  console.log('=== PHASE 1 VALIDATION TEST ===\n');
  
  // Test 1: Supabase connection
  console.log('1. Testing Supabase connection...');
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'GET',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      }
    });
    const text = await response.text();
    if (response.ok) {
      console.log('   ✅ Supabase reachable with service key');
    } else {
      console.log('   ❌ Supabase error:', response.status, text);
    }
  } catch (e) {
    console.log('   ❌ Supabase failed:', e.message);
  }
  
  // Test 2: IDrive e2
  console.log('\n2. Testing IDrive e2 connection...');
  try {
    const result = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
    console.log('   ✅ IDrive e2 reachable');
  } catch (e) {
    console.log('   ❌ IDrive e2 failed:', e.message);
  }
  
  console.log('\n=== VALIDATION COMPLETE ===');
}

testConnections().catch(console.error);
