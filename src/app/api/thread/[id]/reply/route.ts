export const runtime = 'edge';

import '@/lib/polyfill';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { uploadDirect } from '@/lib/s3';
import { hashIP } from '@/lib/ip-hash';
import { verifyPoW } from '@/lib/pow';

const BUMP_LIMIT = 10;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const threadId = parseInt(id);

    if (isNaN(threadId)) {
      return NextResponse.json({ error: 'Invalid thread ID' }, { status: 400 });
    }

    const formData = await request.formData();
    const comment = formData.get('comment') as string;
    const image = formData.get('image') as File | null;
    const powNonce = formData.get('pow_nonce') as string;
    const powTimestamp = parseInt(formData.get('pow_timestamp') as string);

    if (!comment) {
      return NextResponse.json({ error: 'Comment required' }, { status: 400 });
    }

    const powResult = verifyPoW(powNonce, powTimestamp);
    if (!powResult.valid) {
      return NextResponse.json({ error: powResult.message || 'Invalid proof of work', code: powResult.error }, { status: 403 });
    }

    const sanitizedComment = comment.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const { data: thread, error: threadError } = await supabaseAdmin
      .from('threads')
      .select('*')
      .eq('id', threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json({
        service: 'Supabase_Thread_Lookup',
        error: threadError?.message || 'Thread not found',
        errorCode: threadError?.code
      }, { status: 404 });
    }

    if (thread.locked) {
      return NextResponse.json({ error: 'Thread is locked' }, { status: 403 });
    }

    let imageFilename = null;

    if (image && image.size > 0) {
      try {
        const arrayBuffer = await image.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const imgHashBuffer = await globalThis.crypto.subtle.digest('SHA-256', arrayBuffer);
        const imgHashArray = Array.from(new Uint8Array(imgHashBuffer));
        const imgHash = imgHashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
        const ext = image.name.split('.').pop() || 'webp';
        imageFilename = `${imgHash}.${ext}`;

        await uploadDirect(imageFilename, uint8Array, image.type);
      } catch (imgErr) {
        return NextResponse.json({
          service: 'IDrive_S3_Upload',
          error: imgErr instanceof Error ? imgErr.message : 'Upload failed',
        }, { status: 500 });
      }
    }

    let author_ip = 'anonymous';
    try {
      const rawIP = getClientIP(request);
      author_ip = await hashIP(rawIP);
    } catch (hashErr) {
      return NextResponse.json({
        service: 'IP_Hashing',
        error: hashErr instanceof Error ? hashErr.message : 'Hash failed',
      }, { status: 500 });
    }

    const { data: reply, error: replyError } = await supabaseAdmin
      .from('replies')
      .insert({
        thread_id: threadId,
        comment: sanitizedComment,
        image_filename: imageFilename,
        author_ip,
      })
      .select()
      .single();

    if (replyError) {
      return NextResponse.json({
        service: 'Supabase_Insert',
        error: replyError.message,
        errorCode: replyError.code
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

    return NextResponse.json({ success: true, reply });
  } catch (error) {
    console.error('Error creating reply:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      service: 'Unknown',
      error: errorMessage,
      details: String(error)
    }, { status: 500 });
  }
}

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('cf-connecting-ip') || '127.0.0.1';
}