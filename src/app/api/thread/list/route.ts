export const runtime = 'edge';
import '@/lib/polyfill';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getReadSignedUrl } from '@/lib/s3';
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const niche = searchParams.get('niche');
    const search = searchParams.get('search');
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
    let query = supabaseAdmin
      .from('threads')
      .select('*')
      .order('last_bumped_at', { ascending: false })
      .limit(150);
    if (niche && niche !== 'all') {
      query = query.eq('niche', niche);
    }
    if (search && search.trim()) {
      const searchTerm = search.trim().split(/\s+/).join(' & ');
      query = query.textSearch('fts', searchTerm);
    }
    const { data: threads, error } = await query;
    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({
        service: 'Supabase_Query',
        error: error.message,
        errorCode: error.code,
      }, { status: 500 });
    }
    const threadsWithImages = await Promise.all(
      (threads || []).map(async (thread) => {
        if (thread.image_filename) {
          try {
            const url = await getReadSignedUrl(thread.image_filename, 3600);
            return { ...thread, image_filename: url };
          } catch (e) {
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
    }, { status: 500 });
  }
}
