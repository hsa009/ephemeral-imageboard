export const runtime = 'edge';
import '@/lib/polyfill';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getReadSignedUrl } from '@/lib/s3';
interface ThreadRow {
  id: number;
  subject: string;
  comment: string;
  image_filename: string | null;
  created_at: string;
  last_bumped_at: string;
  bump_count: number;
  locked: boolean;
  reactions: Record<string, number>;
}
interface ReplyRow {
  id: number;
  thread_id: number;
  comment: string;
  image_filename: string | null;
  created_at: string;
  reactions: Record<string, number>;
}
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabaseAdmin) {
    return NextResponse.json({ 
      error: 'Service not configured', 
      details: { supabaseAdmin: false }
    }, { status: 500 });
  }
  try {
    const { id } = await params;
    const threadId = parseInt(id);
    if (isNaN(threadId)) {
      return NextResponse.json({ error: 'Invalid thread ID' }, { status: 400 });
    }
    const { data: thread, error: threadError } = await supabaseAdmin
      .from('threads')
      .select('*')
      .eq('id', threadId)
      .single();
    if (threadError || !thread) {
      console.error('Thread fetch error:', threadError);
      return NextResponse.json({ 
        error: 'Thread not found', 
        details: threadError 
      }, { status: 404 });
    }
    const { data: replies, error: repliesError } = await supabaseAdmin
      .from('replies')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });
    if (repliesError) {
      console.error('Replies fetch error:', repliesError);
      return NextResponse.json({ 
        error: repliesError.message, 
        details: repliesError 
      }, { status: 500 });
    }
    const processImage = async (obj: ThreadRow | ReplyRow) => {
      if (obj.image_filename) {
        try {
          const url = await getReadSignedUrl(obj.image_filename, 3600);
          return { ...obj, image_filename: url };
        } catch {
          return { ...obj, image_filename: null };
        }
      }
      return obj;
    };
    const threadWithImage = await processImage(thread);
    const repliesWithImages = await Promise.all(
      (replies || []).map(processImage)
    );
    return NextResponse.json({
      success: true,
      thread: threadWithImage,
      replies: repliesWithImages,
    });
  } catch (error) {
    console.error('Error fetching thread:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ 
      error: errorMessage, 
      details: String(error) 
    }, { status: 500 });
  }
}