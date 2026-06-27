import '@/lib/polyfill';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { s3Client, getBucketName } from '@/lib/s3';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
const MOD_API_KEY = process.env.MOD_API_KEY;
interface ReplyRow {
  image_filename: string | null;
}
export async function POST(request: NextRequest) {
  if (!supabaseAdmin || !s3Client) {
    return NextResponse.json({ error: 'Service not configured' }, { status: 500 });
  }
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${MOD_API_KEY}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { thread_id, action } = await request.json();
    if (!thread_id || !action) {
      return NextResponse.json({ error: 'thread_id and action required' }, { status: 400 });
    }
    if (action === 'lock') {
      const { error } = await supabaseAdmin
        .from('threads')
        .update({ locked: true })
        .eq('id', thread_id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, message: 'Thread locked' });
    }
    if (action === 'unlock') {
      const { error } = await supabaseAdmin
        .from('threads')
        .update({ locked: false })
        .eq('id', thread_id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, message: 'Thread unlocked' });
    }
    if (action === 'delete') {
      const { data: replies } = await supabaseAdmin
        .from('replies')
        .select('image_filename')
        .eq('thread_id', thread_id);
      const { data: thread } = await supabaseAdmin
        .from('threads')
        .select('image_filename')
        .eq('id', thread_id)
        .single();
      const imageFiles = [
        thread?.image_filename,
        ...(replies || []).map((r: ReplyRow) => r.image_filename).filter(Boolean),
      ];
      for (const filename of imageFiles) {
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
      await supabaseAdmin.from('replies').delete().eq('thread_id', thread_id);
      await supabaseAdmin.from('threads').delete().eq('id', thread_id);
      return NextResponse.json({ success: true, message: 'Thread deleted' });
    }
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error in mod action:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
