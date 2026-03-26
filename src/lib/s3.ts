import './polyfill';

const endpoint = process.env.IDRIVE_E2_ENDPOINT || '';
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

// Direct fetch API for S3 operations (bypasses AWS SDK XML parsing issues)
export async function uploadDirect(key: string, body: Uint8Array, contentType: string): Promise<void> {
  if (!isConfigured) {
    throw new Error('S3 not configured');
  }

  const date = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = date.slice(0, 8);
  
  const host = `${bucket}.${new URL(endpoint).host}`;
  const path = `/${key}`;
  
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Length': body.length.toString(),
    'Host': host,
    'x-amz-date': date,
    'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
  };

  const canonicalHeaders = Object.entries(headers).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k.toLowerCase()}:${v}`).join('\n') + '\n';
  const signedHeaders = Object.keys(headers).map(k => k.toLowerCase()).sort().join(';');
  
  const canonicalRequest = [
    'PUT',
    path,
    '',
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const signature = await signRequest(canonicalRequest, accessKey, secretKey, dateStamp, region);
  
  headers['Authorization'] = `AWS4-HMAC-SHA256 Credential=${accessKey}/${dateStamp}/${region}/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`${endpoint}/${bucket}${path}`, {
    method: 'PUT',
    headers,
    body: body as BodyInit,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed: ${response.status} - ${text}`);
  }
}

export async function getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
  if (!isConfigured) {
    throw new Error('S3 not configured');
  }

  const date = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = date.slice(0, 8);
  
  const host = `${bucket}.${new URL(endpoint).host}`;
  const path = `/${key}`;

  const queryParams = [
    `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
    `X-Amz-Credential=${accessKey}%2F${dateStamp}%2F${region}%2Fs3%2Faws4_request`,
    `X-Amz-Date=${date}`,
    `X-Amz-Expires=${expiresIn}`,
    `X-Amz-SignedHeaders=host`,
  ].join('&');

  const fullPath = `${path}?${queryParams}`;
  
  const headers: Record<string, string> = {
    'Host': host,
    'x-amz-date': date,
    'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
  };

  const canonicalHeaders = Object.entries(headers).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k.toLowerCase()}:${v}`).join('\n') + '\n';
  const signedHeaders = Object.keys(headers).map(k => k.toLowerCase()).sort().join(';');
  
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
  
  const canonicalHash = await crypto.subtle.digest('SHA-256', encoder.encode(payload));
  const canonicalHashHex = Array.from(new Uint8Array(canonicalHash)).map(b => b.toString(16).padStart(2, '0')).join('');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    ds,
    `${ds}/${rv}/s3/aws4_request`,
    canonicalHashHex,
  ].join('\n');

  const kDate = await hmacSHA256(encoder.encode(`AWS4${sk}`), ds);
  const kRegion = await hmacSHA256(kDate, rv);
  const kService = await hmacSHA256(kRegion, 's3');
  const kSigning = await hmacSHA256(kService, 'aws4_request');
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