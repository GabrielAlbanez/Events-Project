import { getAllUsers } from '@/app/(actions)/getAllUsers/action';
import { getAuthenticatedAdminId } from '@/lib/adminAuth';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';


type ResponseData = {
  status: string;
  data?: any;
  message?: string;
  error?: string;
}

export async function GET(
  req: NextRequest,
  res: NextResponse<ResponseData>
) {
  if (req.method === 'GET') {
    if (!await getAuthenticatedAdminId(req)) {
      return NextResponse.json({ status: 'error', message: 'Acesso negado.' }, { status: 403 });
    }
    const result = await getAllUsers();
    return NextResponse.json(result, { status: 200 });
  } else {
    return NextResponse.json({ status: 'error', message: 'Method not allowed' }, { status: 405 });
  }
}
