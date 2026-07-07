export const runtime = 'edge';
import '@/lib/polyfill';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { s3Client, getBucketName } from '@/lib/s3';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

const CRON_SECRET = process.env.CRON_SECRET;
const MAX_THREADS = 150;
const TTL_MS = 48 * 60 * 60 * 1000;

interface ThreadRow {
  id: number;
  image_filename: string | null;
  last_bumped_at: string;
}

async function deleteThreadImages(threadId: number, threadImage: string | null): Promise<void> {
  const imageFiles: (string | null)[] = [threadImage];
  const { data: replyImages } = await supabaseAdmin!
    .from('replies')
    .select('image_filename')
    .eq('thread_id', threadId);
  if (replyImages) {
    imageFiles.push(...replyImages.map(r => r.image_filename));
  }
  for (const filename of imageFiles.filter(Boolean)) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: getBucketName(),
        Key: filename!,
      });
      await s3Client!.send(command);
    } catch (e) {
      console.error(`Failed to delete image ${filename}:`, e);
    }
  }
}

export async function POST(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service not configured' }, { status: 500 });
  }
  if (!s3Client) {
    return NextResponse.json({ error: 'S3 not configured' }, { status: 500 });
  }
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: allThreads, error: fetchError } = await supabaseAdmin
      .from('threads')
      .select('id, image_filename, last_bumped_at')
      .order('last_bumped_at', { ascending: false });
    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    const threads: ThreadRow[] = allThreads || [];
    const cutoff = new Date(Date.now() - TTL_MS).toISOString();

    // TTL pass — delete expired threads
    const expiredThreads = threads.filter(t => t.last_bumped_at < cutoff);
    let ttlDeleted = 0;
    for (const thread of expiredThreads) {
      try {
        await deleteThreadImages(thread.id, thread.image_filename);
        await supabaseAdmin.from('threads').delete().eq('id', thread.id);
        ttlDeleted++;
      } catch (e) {
        console.error(`Failed to delete expired thread ${thread.id}:`, e);
      }
    }

    // 150-cap pass — keep only top 150 non-expired threads
    const remainingThreads = threads.filter(t => t.last_bumped_at >= cutoff);
    const overflowThreads = remainingThreads.slice(MAX_THREADS);
    let capDeleted = 0;
    for (const thread of overflowThreads) {
      try {
        await deleteThreadImages(thread.id, thread.image_filename);
        await supabaseAdmin.from('threads').delete().eq('id', thread.id);
        capDeleted++;
      } catch (e) {
        console.error(`Failed to delete overflow thread ${thread.id}:`, e);
      }
    }

    return NextResponse.json({
      success: true,
      ttlDeleted,
      capDeleted,
    });
  } catch (error) {
    console.error('Error pruning threads:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}