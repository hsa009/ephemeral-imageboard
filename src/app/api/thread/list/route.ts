export const runtime = 'edge';
import '@/lib/polyfill';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getReadSignedUrl, s3Client, getBucketName } from '@/lib/s3';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
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
    if (!s3Client) {
      return NextResponse.json({ error: 'S3 not configured' }, { status: 500 });
    }
    // Cleanup pass: delete expired threads + their S3 images
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: expired } = await supabaseAdmin
      .from('threads')
      .select('id, image_filename')
      .lt('last_bumped_at', cutoff);
    for (const thread of expired || []) {
      const { data: ri } = await supabaseAdmin
        .from('replies')
        .select('image_filename')
        .eq('thread_id', thread.id);
      const keys = [
        thread.image_filename,
        ...(ri || []).map((r: any) => r.image_filename).filter(Boolean),
      ];
      for (const key of keys) {
        try {
          await s3Client.send(new DeleteObjectCommand({ Bucket: getBucketName(), Key: key! }));
        } catch (e) {
          console.error(`Failed to delete S3 image ${key}:`, e);
        }
      }
      await supabaseAdmin.from('threads').delete().eq('id', thread.id);
    }
    // Build query
    let query = supabaseAdmin
      .from('threads')
      .select('*')
      .order('last_bumped_at', { ascending: false })
      .limit(150);
    // Filter by niche if provided
    if (niche && niche !== 'all') {
      query = query.eq('niche', niche);
    }
    // Full-text search if provided
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
