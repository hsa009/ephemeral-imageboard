export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { s3Client, getBucketName } from '@/lib/s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export async function GET(_request: NextRequest) {
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
        }
      }, { status: 500 });
    }

    const { data: threads, error } = await supabaseAdmin
      .from('threads')
      .select('*')
      .order('last_bumped_at', { ascending: false })
      .limit(150);

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({
        service: 'Supabase_Query',
        error: error.message,
        errorCode: error.code,
        details: error
      }, { status: 500 });
    }

    const threadsWithImages = await Promise.all(
      (threads || []).map(async (thread) => {
        if (thread.image_filename && s3Client) {
          try {
            const command = new GetObjectCommand({
              Bucket: getBucketName(),
              Key: thread.image_filename,
            });
            const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
            return { ...thread, image_filename: url };
          } catch (e) {
            console.error('Failed to generate signed URL:', e);
            return { ...thread, image_filename: null };
          }
        }
        return thread;
      })
    );

    return NextResponse.json({ success: true, threads: threadsWithImages });
  } catch (error) {
    console.error('Error fetching threads:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      service: 'Unknown',
      error: errorMessage,
      details: String(error)
    }, { status: 500 });
  }
}