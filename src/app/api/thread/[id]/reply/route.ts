export const runtime = 'edge';
import '@/lib/polyfill';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { uploadDirect } from '@/lib/s3';
import { hashIP } from '@/lib/ip-hash';
import { verifyPoW, getClientIP } from '@/lib/pow';
const BUMP_LIMIT = 10;
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log('[Reply-Create] Starting...');
    
    if (!supabaseAdmin) {
      console.error('[Reply-Create] Supabase not initialized');
      return NextResponse.json({
        service: 'Supabase_Connection',
        error: 'Supabase client not initialized',
      }, { status: 500 });
    }
    const { id } = await params;
    const threadId = parseInt(id);
    if (isNaN(threadId)) {
      return NextResponse.json({ error: 'Invalid thread ID' }, { status: 400 });
    }
    const formData = await request.formData();
    const comment = (formData.get('comment') as string)?.trim();
    const image = formData.get('image') as File | null;
    const powNonce = (formData.get('pow_nonce') as string)?.trim();
    const powTimestamp = parseInt(formData.get('pow_timestamp') as string);
    const username = (formData.get('username') as string)?.trim() || 'Anonymous';
    const isVerifiedHandle = formData.get('is_verified_handle') === 'true';
    const replyToId = formData.get('reply_to_id') ? parseInt(formData.get('reply_to_id') as string) : null;
    console.log('[Reply-Create] Received:', { 
      threadId, 
      commentLength: comment?.length,
      hasPoW: !!powNonce,
      replyToId,
      username: username !== 'Anonymous' ? username : '(anonymous)'
    });
    if (!comment) {
      return NextResponse.json({ error: 'Comment required' }, { status: 400 });
    }
    const powResult = verifyPoW(powNonce, powTimestamp);
    if (!powResult.valid) {
      console.error('[Reply-Create] PoW failed:', powResult.error, powResult.message);
      return NextResponse.json({ error: powResult.message || 'Invalid proof of work', code: powResult.error }, { status: 403 });
    }
    console.log('[Reply-Create] PoW verified!');
    const sanitizedComment = comment.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const { data: thread, error: threadError } = await supabaseAdmin
      .from('threads')
      .select('*')
      .eq('id', threadId)
      .single();
    if (threadError || !thread) {
      console.error('[Reply-Create] Thread not found:', threadError);
      return NextResponse.json({
        service: 'Supabase_Thread_Lookup',
        error: threadError?.message || 'Thread not found',
      }, { status: 404 });
    }
    if (thread.locked) {
      return NextResponse.json({ error: 'Thread is locked' }, { status: 403 });
    }
    let imageFilename = null;
    if (image && image.size > 0) {
      try {
        console.log('[Reply-Create] Uploading image:', image.size);
        const arrayBuffer = await image.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const imgHashBuffer = await globalThis.crypto.subtle.digest('SHA-256', arrayBuffer);
        const imgHashArray = Array.from(new Uint8Array(imgHashBuffer));
        const imgHash = imgHashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
        const ext = image.name.split('.').pop() || 'webp';
        imageFilename = `${imgHash}.${ext}`;
        await uploadDirect(imageFilename, uint8Array, image.type);
        console.log('[Reply-Create] Image uploaded:', imageFilename);
      } catch (imgErr) {
        console.error('[Reply-Create] Image upload failed:', imgErr);
        return NextResponse.json({
          service: 'IDrive_S3_Upload',
          error: imgErr instanceof Error ? imgErr.message : 'Upload failed',
        }, { status: 500 });
      }
    }
    let author_ip = 'anonymous';
    try {
      const rawIP = getClientIP(request);
      console.log('[Reply-Create] Client IP:', rawIP);
      author_ip = await hashIP(rawIP);
      console.log('[Reply-Create] IP hashed:', author_ip);
    } catch (hashErr) {
      console.error('[Reply-Create] IP hash failed:', hashErr);
      return NextResponse.json({
        service: 'IP_Hashing',
        error: hashErr instanceof Error ? hashErr.message : 'Hash failed',
      }, { status: 500 });
    }
    console.log('[Reply-Create] Inserting reply...');
    const { data: reply, error: replyError } = await supabaseAdmin
      .from('replies')
      .insert({
        thread_id: threadId,
        comment: sanitizedComment,
        image_filename: imageFilename,
        author_ip,
        username,
        is_verified_handle: isVerifiedHandle,
        reply_to_id: replyToId,
      })
      .select()
      .single();
    if (replyError) {
      console.error('[Reply-Create] Supabase error:', replyError);
      return NextResponse.json({
        service: 'Supabase_Insert',
        error: replyError.message,
      }, { status: 500 });
    }
    const shouldBump = thread.bump_count < BUMP_LIMIT;
    if (shouldBump) {
      await supabaseAdmin
        .from('threads')
        .update({
          last_bumped_at: new Date().toISOString(),
          bump_count: thread.bump_count + 1,
        })
        .eq('id', threadId);
    }
    console.log('[Reply-Create] Success! Reply ID:', reply.id);
    return NextResponse.json({ success: true, reply });
    
  } catch (error) {
    console.error('[Reply-Create] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      service: 'Unknown',
      error: errorMessage,
    }, { status: 500 });
  }
}
