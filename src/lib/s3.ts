import './polyfill';

import { S3Client } from '@aws-sdk/client-s3';

const endpoint = process.env.IDRIVE_E2_ENDPOINT;
const region = process.env.IDRIVE_E2_REGION;
const accessKey = process.env.IDRIVE_E2_ACCESS_KEY;
const secretKey = process.env.IDRIVE_E2_SECRET_KEY;
const bucket = process.env.IDRIVE_E2_BUCKET;

if (!endpoint || !region || !accessKey || !secretKey || !bucket) {
  console.warn('Missing IDRIVE_E2_* environment variables - S3 client will not be available');
}

export const s3Client = (endpoint && region && accessKey && secretKey)
  ? new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      forcePathStyle: true,
    })
  : null;

export const getBucketName = () => bucket;