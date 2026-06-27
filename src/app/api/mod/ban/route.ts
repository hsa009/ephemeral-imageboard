export const runtime = 'edge';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
const MOD_API_KEY = process.env.MOD_API_KEY;
export async function POST(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service not configured' }, { status: 500 });
  }
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${MOD_API_KEY}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { ip_address, reason, duration_hours } = await request.json();
    if (!ip_address) {
      return NextResponse.json({ error: 'ip_address required' }, { status: 400 });
    }
    const expiresAt = duration_hours 
      ? new Date(Date.now() + duration_hours * 60 * 60 * 1000).toISOString()
      : null;
    const { data, error } = await supabaseAdmin
      .from('bans')
      .insert({
        ip_address,
        reason: reason || null,
        expires_at: expiresAt,
      })
      .select()
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, ban: data });
  } catch (error) {
    console.error('Error creating ban:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export async function GET(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service not configured' }, { status: 500 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const ip = searchParams.get('ip');
    if (!ip) {
      return NextResponse.json({ error: 'ip parameter required' }, { status: 400 });
    }
    const { data: ban } = await supabaseAdmin
      .from('bans')
      .select('*')
      .eq('ip_address', ip)
      .single();
    if (!ban) {
      return NextResponse.json({ banned: false });
    }
    if (ban.expires_at && new Date(ban.expires_at) < new Date()) {
      return NextResponse.json({ banned: false, expired: true });
    }
    return NextResponse.json({ 
      banned: true, 
      reason: ban.reason,
      expires_at: ban.expires_at 
    });
  } catch (error) {
    console.error('Error checking ban:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
