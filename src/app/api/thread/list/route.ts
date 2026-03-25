export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { s3Client, getBucketName } from '@/lib/s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export async function GET(_request: NextRequest) {
  if (!supabaseAdmin || !s3Client) {
    return NextResponse.json({ error: 'Service not configured' }, { status: 500 });
  }

  try {
    const { data: threads, error } = await supabaseAdmin
      .from('threads')
      .select('*')
      .order('last_bumped_at', { ascending: false })
      .limit(150);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
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

    return NextResponse.json({ threads: threadsWithImages });
  } catch (error) {
    console.error('Error fetching threads:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
