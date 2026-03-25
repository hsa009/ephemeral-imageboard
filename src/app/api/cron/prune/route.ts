export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { s3Client, getBucketName } from '@/lib/s3';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

const CRON_SECRET = process.env.CRON_SECRET;
const MAX_THREADS = 150;

interface ReplyRow {
  image_filename: string | null;
}

export async function POST(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service not configured' }, { status: 500 });
  }

  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: allThreads, error: fetchError } = await supabaseAdmin
      .from('threads')
      .select('id, image_filename')
      .order('last_bumped_at', { ascending: false });

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const threadsToDelete = (allThreads || []).slice(MAX_THREADS);

    let deletedCount = 0;
    const errors: string[] = [];

    for (const thread of threadsToDelete) {
      try {
        const { data: replies } = await supabaseAdmin
          .from('replies')
          .select('image_filename')
          .eq('thread_id', thread.id);

        const imageFiles = [
          thread.image_filename,
          ...(replies || []).map((r: ReplyRow) => r.image_filename).filter(Boolean),
        ];

        for (const filename of imageFiles) {
          if (!s3Client) continue;
          try {
            const command = new DeleteObjectCommand({
              Bucket: getBucketName(),
              Key: filename,
            });
            await s3Client.send(command);
          } catch (e) {
            console.error(`Failed to delete image ${filename}:`, e);
          }
        }

        await supabaseAdmin.from('replies').delete().eq('thread_id', thread.id);
        await supabaseAdmin.from('threads').delete().eq('id', thread.id);

        deletedCount++;
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : 'Unknown error';
        errors.push(`Thread ${thread.id}: ${errMsg}`);
      }
    }

    return NextResponse.json({
      success: true,
      deleted: deletedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error pruning threads:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
