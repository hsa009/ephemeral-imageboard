import './polyfill';

const endpoint = (process.env.IDRIVE_E2_ENDPOINT || '').replace(/\/$/, '');
const region = process.env.IDRIVE_E2_REGION || '';
const accessKey = process.env.IDRIVE_E2_ACCESS_KEY || '';
const secretKey = process.env.IDRIVE_E2_SECRET_KEY || '';
const bucket = process.env.IDRIVE_E2_BUCKET || '';

const isConfigured = endpoint && region && accessKey && secretKey && bucket;

if (!isConfigured) {
  console.warn('Missing IDRIVE_E2_* environment variables - S3 client will not be available');
}

export const getBucketName = () => bucket;

// Dummy client for health checks
export const s3Client = { send: () => Promise.resolve({}) } as unknown as { send: (cmd: unknown) => Promise<unknown> };

function getHost(): string {
  const cleanEndpoint = endpoint.replace(/^https?:\/\//, '');
  return `${bucket}.${cleanEndpoint}`;
}

function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const sec = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${hour}${min}${sec}Z`;
}

function formatDateStamp(dateStr: string): string {
  return dateStr.slice(0, 8);
}

// Direct fetch API for S3 operations
export async function uploadDirect(key: string, body: Uint8Array, contentType: string): Promise<void> {
  if (!isConfigured) {
    throw new Error('S3 not configured');
  }

  // Ensure body is a proper Uint8Array
  const bodyBytes = body instanceof Uint8Array ? body : new Uint8Array(body);
  
  const now = new Date();
  const amzDate = formatDate(now);
  const dateStamp = formatDateStamp(amzDate);
  
  const host = getHost();
  // Use raw key without URL encoding in path (S3 handles this)
  const path = `/${key}`;
  
  console.log('S3 Upload:', { endpoint, bucket, host, key, bodyLength: bodyBytes.length, amzDate, dateStamp, region });
  
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Length': bodyBytes.length.toString(),
    'Host': host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
  };

  // Sort headers alphabetically (required for AWS signature)
  const sortedHeaders = Object.entries(headers).sort(([a], [b]) => a.localeCompare(b));
  const canonicalHeaders = sortedHeaders
    .map(([k, v]) => `${k.toLowerCase()}:${v}`).join('\n') + '\n';
  const signedHeaders = sortedHeaders.map(([k]) => k.toLowerCase()).sort().join(';');
  
  // Canonical request must match exactly what AWS expects
  const canonicalRequest = [
    'PUT',
    path,
    '',
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  console.log('Canonical Request:', canonicalRequest.slice(0, 200));

  const signature = await signRequest(canonicalRequest, accessKey, secretKey, dateStamp, region);
  
  headers['Authorization'] = `AWS4-HMAC-SHA256 Credential=${accessKey}/${dateStamp}/${region}/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const uploadUrl = `${endpoint}/${bucket}${path}`;
  console.log('Auth:', headers['Authorization']?.slice(0, 60) + '...');

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers,
    body: bodyBytes as unknown as BodyInit,
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('Upload failed:', response.status, text);
    throw new Error(`Upload failed: ${response.status} - ${text}`);
  }
  
  console.log('Upload success!');
}

export async function getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
  if (!isConfigured) {
    throw new Error('S3 not configured');
  }

  const now = new Date();
  const amzDate = formatDate(now);
  const dateStamp = formatDateStamp(amzDate);
  
  const host = getHost();
  const path = `/${key}`;
  const expiry = Math.floor(Date.now() / 1000) + expiresIn;

  const queryParams = [
    `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
    `X-Amz-Credential=${encodeURIComponent(accessKey)}/${dateStamp}/${region}/s3/aws4_request`,
    `X-Amz-Date=${amzDate}`,
    `X-Amz-Expires=${expiresIn}`,
    `X-Amz-SignedHeaders=host`,
  ].sort().join('&');

  const fullPath = `${path}?${queryParams}`;
  
  const headers: Record<string, string> = {
    'Host': host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
  };

  const sortedHeaders = Object.entries(headers).sort(([a], [b]) => a.localeCompare(b));
  const canonicalHeaders = sortedHeaders
    .map(([k, v]) => `${k.toLowerCase()}:${v}`).join('\n') + '\n';
  const signedHeaders = sortedHeaders.map(([k]) => k.toLowerCase()).join(';');
  
  const canonicalRequest = [
    'GET',
    fullPath,
    '',
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const signature = await signRequest(canonicalRequest, accessKey, secretKey, dateStamp, region);
  
  return `${endpoint}/${bucket}${fullPath}&X-Amz-Signature=${signature}`;
}

async function signRequest(payload: string, ak: string, sk: string, ds: string, rv: string): Promise<string> {
  const encoder = new TextEncoder();
  
  // Step 1: Hash the canonical request
  const canonicalHash = await crypto.subtle.digest('SHA-256', encoder.encode(payload));
  const canonicalHashHex = Array.from(new Uint8Array(canonicalHash)).map(b => b.toString(16).padStart(2, '0')).join('');

  // Step 2: String to sign
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    ds,
    `${ds}/${rv}/s3/aws4_request`,
    canonicalHashHex,
  ].join('\n');

  // Step 3: Calculate signing key
  const kDate = await hmacSHA256(encoder.encode(`AWS4${sk}`), ds);
  const kRegion = await hmacSHA256(kDate, rv);
  const kService = await hmacSHA256(kRegion, 's3');
  const kSigning = await hmacSHA256(kService, 'aws4_request');
  
  // Step 4: Calculate signature
  const signature = await hmacSHA256(kSigning, stringToSign);

  return Array.from(signature).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function hmacSHA256(key: Uint8Array | ArrayBuffer, data: string): Promise<Uint8Array> {
  const keyData = key instanceof ArrayBuffer ? new Uint8Array(key) : key;
  const cryptoKey = await (crypto as any).subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return new Uint8Array(await (crypto as any).subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data)));
}
/* eslint-enable @typescript-eslint/no-explicit-any */