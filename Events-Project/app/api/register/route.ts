import { NextRequest, NextResponse  } from 'next/server';
import { registerUser } from '@/app/(actions)/Registro/action';
 
type ResponseData = {
  status: string;
  message?: string;
  error?: string;
}
 
export  async function POST(
  req: NextRequest,
  res: NextResponse<ResponseData>
) {
    if (req.method === 'POST') {
        const { name, email, password } = await req.json();
    
        const result = await registerUser({ name, email, password });
    
        return NextResponse.json(result, { status: 200 });
      } else {
        return NextResponse.json({ status: 'error', message: 'Method not allowed' }, { status: 405 });
      }
}