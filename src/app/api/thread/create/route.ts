export const runtime = 'edge';

import '@/lib/polyfill';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { s3Client, getBucketName } from '@/lib/s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { hashIP, getClientIP } from '@/lib/ip-hash';

const POW_DIFFICULTY = '0000';
const POW_MAX_AGE = 60000;

function verifyPoW(nonce: string, timestamp: number): boolean {
  if (!nonce || !timestamp) return false;
  if (Date.now() - timestamp > POW_MAX_AGE) return false;
  
  const [, hash] = nonce.split('-');
  if (!hash || !hash.startsWith(POW_DIFFICULTY)) return false;
  
  return true;
}

export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({
        service: 'Supabase_Connection',
        error: 'Supabase client not initialized',
        envCheck: {
          SUPABASE_URL: !!process.env.SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        }
      }, { status: 500 });
    }

    if (!s3Client) {
      return NextResponse.json({
        service: 'IDrive_S3_Client',
        error: 'S3 client not initialized',
        envCheck: {
          IDRIVE_E2_ENDPOINT: !!process.env.IDRIVE_E2_ENDPOINT,
          IDRIVE_E2_REGION: !!process.env.IDRIVE_E2_REGION,
          IDRIVE_E2_BUCKET: !!process.env.IDRIVE_E2_BUCKET,
          IDRIVE_E2_ACCESS_KEY: !!process.env.IDRIVE_E2_ACCESS_KEY,
          IDRIVE_E2_SECRET_KEY: !!process.env.IDRIVE_E2_SECRET_KEY,
        }
      }, { status: 500 });
    }

    const formData = await request.formData();
    const subject = formData.get('subject') as string;
    const comment = formData.get('comment') as string;
    const image = formData.get('image') as File | null;
    const powNonce = formData.get('pow_nonce') as string;
    const powTimestamp = parseInt(formData.get('pow_timestamp') as string);

    if (!subject || !comment) {
      return NextResponse.json({ error: 'Subject and comment required' }, { status: 400 });
    }

    if (!verifyPoW(powNonce, powTimestamp)) {
      return NextResponse.json({ error: 'Invalid proof of work' }, { status: 403 });
    }

    const sanitizedSubject = subject.replace(/[<>]/g, '');
    const sanitizedComment = comment.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let imageFilename = null;

    if (image && image.size > 0) {
      try {
        const arrayBuffer = await image.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const imgHashBuffer = await globalThis.crypto.subtle.digest('SHA-256', arrayBuffer);
        const imgHashArray = Array.from(new Uint8Array(imgHashBuffer));
        const imgHash = imgHashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
        const ext = image.name.split('.').pop() || 'webp';
        imageFilename = `${imgHash}.${ext}`;

        const command = new PutObjectCommand({
          Bucket: getBucketName(),
          Key: imageFilename,
          Body: uint8Array,
          ContentType: image.type,
        });

        await s3Client.send(command);
      } catch (imgErr) {
        return NextResponse.json({
          service: 'IDrive_S3_Upload',
          error: imgErr instanceof Error ? imgErr.message : 'Upload failed',
          envCheck: {
            IDRIVE_E2_ENDPOINT: !!process.env.IDRIVE_E2_ENDPOINT,
            IDRIVE_E2_BUCKET: !!process.env.IDRIVE_E2_BUCKET,
          }
        }, { status: 500 });
      }
    }

    let author_ip = 'anonymous';
    try {
      const rawIP = getClientIP(request);
      author_ip = await hashIP(rawIP);
    } catch (hashErr) {
      return NextResponse.json({
        service: 'IP_Hashing',
        error: hashErr instanceof Error ? hashErr.message : 'Hash failed',
        envCheck: {
          IP_SALT: !!process.env.IP_SALT,
        }
      }, { status: 500 });
    }

    const { data, error } = await supabaseAdmin
      .from('threads')
      .insert({
        subject: sanitizedSubject,
        comment: sanitizedComment,
        image_filename: imageFilename,
        author_ip,
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({
        service: 'Supabase_Insert',
        error: error.message,
        errorCode: error.code,
        details: error
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, thread: data });
  } catch (error) {
    console.error('Error creating thread:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      service: 'Unknown',
      error: errorMessage,
      details: String(error)
    }, { status: 500 });
  }
}