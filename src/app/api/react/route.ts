export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service not configured' }, { status: 500 });
  }

  try {
    const { type, id, emoji } = await request.json();

    if (!type || !id || !emoji) {
      return NextResponse.json({ error: 'type, id, and emoji required' }, { status: 400 });
    }

    const validEmojis = ['🔥', '💀', '🤡', '👀'];
    if (!validEmojis.includes(emoji)) {
      return NextResponse.json({ error: 'Invalid emoji' }, { status: 400 });
    }

    const table = type === 'thread' ? 'threads' : 'replies';

    const { data: current, error: fetchError } = await supabaseAdmin
      .from(table)
      .select('reactions')
      .eq('id', id)
      .single();

    if (fetchError || !current) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const reactions = current.reactions || {};
    reactions[emoji] = (reactions[emoji] || 0) + 1;

    const { error: updateError } = await supabaseAdmin
      .from(table)
      .update({ reactions })
      .eq('id', id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, reactions });
  } catch (error) {
    console.error('Error adding reaction:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
