import '@/lib/polyfill';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
const CRON_SECRET = process.env.CRON_SECRET;
const MAX_THREADS = 150;
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
      .select('id')
      .order('last_bumped_at', { ascending: false });
    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    const threadsToDelete = (allThreads || []).slice(MAX_THREADS);
    let deletedCount = 0;
    for (const thread of threadsToDelete) {
      try {
        await supabaseAdmin.from('replies').delete().eq('thread_id', thread.id);
        await supabaseAdmin.from('threads').delete().eq('id', thread.id);
        deletedCount++;
      } catch (e: unknown) {
        console.error(`Failed to delete thread ${thread.id}:`, e);
      }
    }
    return NextResponse.json({
      success: true,
      deleted: deletedCount,
    });
  } catch (error) {
    console.error('Error pruning threads:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}