export const runtime = 'edge';

import '@/lib/polyfill';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSignedUrl } from '@/lib/s3';

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
        if (thread.image_filename) {
          try {
            const url = await getSignedUrl(thread.image_filename, 3600);
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