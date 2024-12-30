import { NextRequest, NextResponse  } from 'next/server';
import prisma from "@/lib/prisma";

type ResponseData = {
    status: string;
    message?: string;
    error?: string;
    user?: any; // Add the user property
  }

export  async function  GET(
    req: NextRequest,
    res: NextResponse<ResponseData>
){
  if (req.method === "GET") {
    const token = req.nextUrl.searchParams.get('token');

    // Verify the token
    const verificationToken = await prisma.verificationTokenEmail.findUnique({
      where: { token: token as string },
    });

    if (!verificationToken) {
      return NextResponse.json({ status: "error", message: "Invalid or expired token" }, { status: 400 });
    }

    // Create the user in the database
    const newUser = await prisma.user.create({
      data: {
        name: verificationToken.name,
        email: verificationToken.email,
        password: verificationToken.password,
      },
    });

    await prisma.user.update({
      where : { email: verificationToken.email },
      data: {
        emailVerified: true,
      }
    })

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Delete the token
    await prisma.verificationTokenEmail.delete({
      where: { token: token as string },
    });

    

    return NextResponse.json({ status: "success", message: "Email verified. User created successfully.", user: newUser }, { status: 200 });
  } else {
    return NextResponse.json({ status: "error", message: "Method not allowed" }, { status: 405 });
  }
};