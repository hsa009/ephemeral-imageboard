export const runtime = 'edge';
import '@/lib/polyfill';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getBucketName, uploadDirect, getReadSignedUrl } from '@/lib/s3';
import { hashIP } from '@/lib/ip-hash';
import { verifyPoW, getClientIP } from '@/lib/pow';
import { classifyNiche } from '@/lib/classifier';
export async function POST(request: NextRequest) {
  try {
    // Debug: log environment check (sanitized)
    console.log('[Thread-Create] Env check:', {
      supabaseUrl: !!process.env.SUPABASE_URL,
      supabaseKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      s3Endpoint: !!process.env.IDRIVE_E2_ENDPOINT,
      s3Bucket: !!process.env.IDRIVE_E2_BUCKET,
    });
    if (!supabaseAdmin) {
      console.error('[Thread-Create] Supabase not initialized');
      return NextResponse.json({
        service: 'Supabase_Connection',
        error: 'Supabase client not initialized',
      }, { status: 500 });
    }
    const formData = await request.formData();
    const subject = (formData.get('subject') as string)?.trim();
    const comment = (formData.get('comment') as string)?.trim();
    const image = formData.get('image') as File | null;
    const powNonce = (formData.get('pow_nonce') as string)?.trim();
    const powTimestamp = parseInt(formData.get('pow_timestamp') as string);
    const username = (formData.get('username') as string)?.trim() || 'Anonymous';
    console.log('[Thread-Create] Received:', { 
      subjectLength: subject?.length,
      commentLength: comment?.length,
      hasImage: !!image,
      hasPoW: !!powNonce,
      username: username !== 'Anonymous' ? username : '(anonymous)',
    });
    if (!subject || !comment) {
      return NextResponse.json({ error: 'Subject and comment required' }, { status: 400 });
    }
    // Verify PoW
    console.log('[Thread-Create] Verifying PoW...');
    const powResult = verifyPoW(powNonce, powTimestamp);
    if (!powResult.valid) {
      console.error('[Thread-Create] PoW failed:', powResult.error, powResult.message);
      return NextResponse.json({ error: powResult.message || 'Invalid proof of work', code: powResult.error }, { status: 403 });
    }
    console.log('[Thread-Create] PoW verified!');
    // Sanitize inputs
    const sanitizedSubject = subject.replace(/[<>]/g, '');
    const sanitizedComment = comment.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Handle image upload
    let imageFilename = null;
    if (image && image.size > 0) {
      try {
        console.log('[Thread-Create] Uploading image:', image.size, image.type);
        const arrayBuffer = await image.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        const imgHashBuffer = await globalThis.crypto.subtle.digest('SHA-256', arrayBuffer);
        const imgHashArray = Array.from(new Uint8Array(imgHashBuffer));
        const imgHash = imgHashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
        
        const contentType = image.type || 'image/png';
        const ext = image.name.split('.').pop() || contentType.split('/')[1] || 'png';
        imageFilename = `${imgHash}.${ext}`;
        await uploadDirect(imageFilename, uint8Array, contentType);
        console.log('[Thread-Create] Image uploaded:', imageFilename);
      } catch (imgErr) {
        console.error('[Thread-Create] Image upload failed:', imgErr);
        return NextResponse.json({
          service: 'IDrive_S3_Upload',
          error: imgErr instanceof Error ? imgErr.message : 'Upload failed',
        }, { status: 500 });
      }
    }
    // Hash IP for anonymity
    let author_ip = 'anonymous';
    try {
      const rawIP = getClientIP(request);
      console.log('[Thread-Create] Client IP:', rawIP);
      author_ip = await hashIP(rawIP);
      console.log('[Thread-Create] IP hashed:', author_ip);
    } catch (hashErr) {
      console.error('[Thread-Create] IP hash failed:', hashErr);
      return NextResponse.json({
        service: 'IP_Hashing',
        error: hashErr instanceof Error ? hashErr.message : 'Hash failed',
      }, { status: 500 });
    }
    // Classify niche using AI
    console.log('[Thread-Create] Classifying niche...');
    const classification = await classifyNiche(subject, comment);
    const niche = classification.niche;
    // Insert into database
    console.log('[Thread-Create] Inserting thread...');
    const { data, error } = await supabaseAdmin
      .from('threads')
      .insert({
        subject: sanitizedSubject,
        comment: sanitizedComment,
        image_filename: imageFilename,
        username: username,
        author_ip,
        niche,
      })
      .select()
      .single();
    if (error) {
      console.error('[Thread-Create] Supabase error:', error);
      return NextResponse.json({
        service: 'Supabase_Insert',
        error: error.message,
        errorCode: error.code,
      }, { status: 500 });
    }
    console.log('[Thread-Create] Success! Thread ID:', data.id);
    console.log('[GHOST BRAIN] Bridge to browser - Final niche:', niche);
    return NextResponse.json({
      success: true,
      thread: data,
      debug: {
        status: classification.status,
        niche_found: niche,
        rawOutput: classification.rawResponse,
        finalNiche: niche,
        latency_ms: classification.latency_ms,
        error_msg: classification.error_msg,
        fallback: classification.fallback,
      }
    });
    
  } catch (error) {
    console.error('[Thread-Create] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      service: 'Unknown',
      error: errorMessage,
    }, { status: 500 });
  }
}
