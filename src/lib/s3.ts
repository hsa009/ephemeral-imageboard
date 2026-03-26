import './polyfill';

import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

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

// S3 client with forcePathStyle for IDrive e2
export const s3Client = isConfigured
  ? new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      forcePathStyle: true,
      tls: true,
    })
  : null;

// Upload using presigned URL (bypasses Edge header mutation issues)
export async function uploadDirect(key: string, body: Uint8Array, contentType: string): Promise<void> {
  if (!s3Client || !isConfigured) {
    throw new Error('S3 not configured');
  }

  console.log('Presigned Upload:', { key, size: body.length, contentType });

  try {
    // Create presigned URL
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    console.log('Signed URL generated:', signedUrl.slice(0, 80) + '...');

    // Upload using standard fetch
    const response = await fetch(signedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': body.length.toString(),
      },
      body: body as unknown as BodyInit,
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Presigned upload failed:', response.status, text);
      throw new Error(`Upload failed: ${response.status} - ${text}`);
    }

    console.log('Presigned upload success!');
  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
}

// Get signed URL for reading (for thread list)

export async function getReadSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
  if (!s3Client || !isConfigured) {
    throw new Error('S3 not configured');
  }

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}