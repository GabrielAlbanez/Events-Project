import { NextRequest, NextResponse } from 'next/server';
import { registerUser, type RegisterErrorCode } from '@/lib/services/registration';
import { checkOrigin, readCommunityBody } from '@/lib/community/http';
import { CommunityError } from '@/lib/community/common';
import { clientKeyFromHeaders } from '@/lib/rateLimit';

const noStore = { 'Cache-Control': 'no-store' };
const statusFor: Record<RegisterErrorCode, number> = { invalid: 400, rate_limited: 429, unavailable: 503 };

function readField(body: unknown, name: 'name' | 'email' | 'password'): string {
  if (!body || typeof body !== 'object' || !(name in body)) return '';
  const value = (body as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : '';
}

// Response contract kept for the web form: { status: 'success', message } or { status: 'error', error }.
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const body = await readCommunityBody(req);
    const result = await registerUser(
      { name: readField(body, 'name'), email: readField(body, 'email'), password: readField(body, 'password') },
      clientKeyFromHeaders(req.headers),
    );
    if (result.status === 'success') return NextResponse.json(result, { status: 200, headers: noStore });
    const headers = result.code === 'rate_limited' ? { ...noStore, 'Retry-After': '900' } : noStore;
    return NextResponse.json({ status: 'error', error: result.error }, { status: statusFor[result.code], headers });
  } catch (error) {
    const status = error instanceof CommunityError ? error.status : 500;
    const message = error instanceof CommunityError ? error.message : 'Não foi possível concluir o cadastro. Tente novamente.';
    return NextResponse.json({ status: 'error', error: message }, { status, headers: noStore });
  }
}
