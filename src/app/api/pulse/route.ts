export const runtime = 'edge';

import '@/lib/polyfill';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isThreadExpired } from '@/components/VoidTimer';

export async function GET() {
  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, error: 'Supabase not initialized' }, { status: 500 });
  }

  try {
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

    // Get threads with their reply counts in the last hour
    const { data: threads, error: threadsError } = await supabaseAdmin
      .from('threads')
      .select('id, subject, niche, last_bumped_at, bump_count, created_at, reactions, image_filename')
      .order('last_bumped_at', { ascending: false })
      .limit(50);

    if (threadsError) throw threadsError;

    // Get reply counts in the last hour per thread
    const { data: recentReplies, error: repliesError } = await supabaseAdmin
      .from('replies')
      .select('thread_id')
      .gte('created_at', oneHourAgo);

    if (repliesError) throw repliesError;

    // Count replies per thread
    const replyCountMap: Record<number, number> = {};
    for (const r of recentReplies || []) {
      replyCountMap[r.thread_id] = (replyCountMap[r.thread_id] || 0) + 1;
    }

    // Calculate heat scores
    const scored = (threads || [])
      .filter(t => !isThreadExpired(t.last_bumped_at))
      .map(t => {
        const recentReplies = replyCountMap[t.id] || 0;
        const totalReactions = Object.values(t.reactions || {}).reduce((sum: number, v) => sum + (v as number), 0);
        const heatScore = (recentReplies * 10) + (totalReactions * 5) + (t.bump_count * 1);
        return {
          id: t.id,
          subject: t.subject,
          niche: t.niche,
          heat_score: heatScore,
          recent_replies: recentReplies,
          total_reactions: totalReactions,
          last_bumped_at: t.last_bumped_at,
          image_filename: t.image_filename,
        };
      })
      .sort((a, b) => b.heat_score - a.heat_score)
      .slice(0, 5);

    // Normalize heat scores to 0-100 for the progress bar
    const maxScore = Math.max(...scored.map(s => s.heat_score), 1);
    const normalized = scored.map(s => ({
      ...s,
      heat_normalized: Math.round((s.heat_score / maxScore) * 100),
    }));

    return NextResponse.json({
      success: true,
      pulse: normalized,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[PULSE] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
