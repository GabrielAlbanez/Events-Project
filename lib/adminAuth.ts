import { headers } from "next/headers";
import { getToken } from "next-auth/jwt";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

export async function getAuthenticatedUser(request?: NextRequest) {
  const authRequest = request ?? new NextRequest("http://localhost", { headers: headers() });
  const token = await getToken({ req: authRequest, secret: process.env.NEXTAUTH_SECRET });

  if (typeof token?.id !== "string" || !token.id) return null;
  if (token.provider === "dev-admin" &&
    (process.env.NODE_ENV !== "development" || process.env.DEV_AUTO_LOGIN_ADMIN !== "true")) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: token.id },
    select: { id: true, role: true },
  });
}

export async function getAuthenticatedAdminId(request?: NextRequest): Promise<string | null> {
  const user = await getAuthenticatedUser(request);
  return user?.role === "ADMIN" ? user.id : null;
}
