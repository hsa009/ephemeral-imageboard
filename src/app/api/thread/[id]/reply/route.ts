export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { s3Client, getBucketName } from '@/lib/s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';

const BUMP_LIMIT = 10;

const POW_DIFFICULTY = '0000';
const POW_MAX_AGE = 60000;

function verifyPoW(nonce: string, timestamp: number): boolean {
  if (!nonce || !timestamp) return false;
  if (Date.now() - timestamp > POW_MAX_AGE) return false;
  
  const [, hash] = nonce.split('-');
  if (!hash || !hash.startsWith(POW_DIFFICULTY)) return false;
  
  return true;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabaseAdmin || !s3Client) {
    return NextResponse.json({ error: 'Service not configured' }, { status: 500 });
  }

  try {
    const { id } = await params;
    const threadId = parseInt(id);

    const formData = await request.formData();
    const comment = formData.get('comment') as string;
    const image = formData.get('image') as File | null;
    const powNonce = formData.get('pow_nonce') as string;
    const powTimestamp = parseInt(formData.get('pow_timestamp') as string);

    if (!comment) {
      return NextResponse.json({ error: 'Comment required' }, { status: 400 });
    }

    if (!verifyPoW(powNonce, powTimestamp)) {
      return NextResponse.json({ error: 'Invalid proof of work' }, { status: 403 });
    }

    const sanitizedComment = comment.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const { data: thread } = await supabaseAdmin
      .from('threads')
      .select('*')
      .eq('id', threadId)
      .single();

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    if (thread.locked) {
      return NextResponse.json({ error: 'Thread is locked' }, { status: 403 });
    }

    let imageFilename = null;

    if (image && image.size > 0) {
      const arrayBuffer = await image.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
      const ext = image.name.split('.').pop() || 'webp';
      imageFilename = `${hash}.${ext}`;

      const command = new PutObjectCommand({
        Bucket: getBucketName(),
        Key: imageFilename,
        Body: buffer,
        ContentType: image.type,
      });

      await s3Client.send(command);
    }

    const { data: reply, error: replyError } = await supabaseAdmin
      .from('replies')
      .insert({
        thread_id: threadId,
        comment: sanitizedComment,
        image_filename: imageFilename,
      })
      .select()
      .single();

    if (replyError) {
      return NextResponse.json({ error: replyError.message }, { status: 500 });
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

    return NextResponse.json({ reply });
  } catch (error) {
    console.error('Error creating reply:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
