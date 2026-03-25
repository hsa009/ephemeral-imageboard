export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { s3Client, getBucketName } from '@/lib/s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';

const POW_DIFFICULTY = '0000';
const POW_MAX_AGE = 60000;

function verifyPoW(nonce: string, timestamp: number): boolean {
  if (!nonce || !timestamp) return false;
  if (Date.now() - timestamp > POW_MAX_AGE) return false;
  
  const [, hash] = nonce.split('-');
  if (!hash || !hash.startsWith(POW_DIFFICULTY)) return false;
  
  return true;
}

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('cf-connecting-ip') || 'anonymous';
}

export async function POST(request: NextRequest) {
  if (!supabaseAdmin || !s3Client) {
    console.error('Service not configured:', { supabaseAdmin: !!supabaseAdmin, s3Client: !!s3Client });
    return NextResponse.json({ error: 'Service not configured', details: 'Check environment variables' }, { status: 500 });
  }

  try {
    const formData = await request.formData();
    const subject = formData.get('subject') as string;
    const comment = formData.get('comment') as string;
    const image = formData.get('image') as File | null;
    const powNonce = formData.get('pow_nonce') as string;
    const powTimestamp = parseInt(formData.get('pow_timestamp') as string);

    if (!subject || !comment) {
      return NextResponse.json({ error: 'Subject and comment required' }, { status: 400 });
    }

    if (!verifyPoW(powNonce, powTimestamp)) {
      return NextResponse.json({ error: 'Invalid proof of work' }, { status: 403 });
    }

    const sanitizedSubject = subject.replace(/[<>]/g, '');
    const sanitizedComment = comment.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let imageFilename = null;

    if (image && image.size > 0) {
      const arrayBuffer = await image.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
      const ext = image.name.split('.').pop() || 'webp';
      imageFilename = `${hash}.${ext}`;

      const command = new PutObjectCommand({
        Bucket: getBucketName(),
        Key: imageFilename,
        Body: uint8Array,
        ContentType: image.type,
      });

      await s3Client.send(command);
    }

    const clientIP = getClientIP(request);
    const ipHash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(clientIP));
    const hashedIP = Array.from(new Uint8Array(ipHash)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);

    const { data, error } = await supabaseAdmin
      .from('threads')
      .insert({
        subject: sanitizedSubject,
        comment: sanitizedComment,
        image_filename: imageFilename,
        author_ip: hashedIP,
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
    }

    return NextResponse.json({ thread: data });
  } catch (error) {
    console.error('Error creating thread:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Internal server error', details: errorMessage }, { status: 500 });
  }
}
