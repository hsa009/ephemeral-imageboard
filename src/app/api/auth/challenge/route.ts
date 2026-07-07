export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { generateChallenge } from '@/lib/auth';

export async function GET() {
  const { nonce, message } = generateChallenge();
  return NextResponse.json({ nonce, challenge: message });
}
