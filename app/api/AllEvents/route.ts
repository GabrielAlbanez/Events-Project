import getAllEvents from '@/app/(actions)/getAlllEvents/action';
import { NextRequest, NextResponse } from 'next/server';


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
    const result = await getAllEvents();
    return NextResponse.json(result, { status: 200 });
  } else {
    return NextResponse.json({ status: 'error', message: 'Method not allowed' }, { status: 405 });
  }
}