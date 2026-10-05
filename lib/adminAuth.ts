import { isAccountSuspended, accountSessionValid } from "@/lib/auth/accountAccess";
import { headers } from "next/headers";
import { getToken } from "next-auth/jwt";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { isDevelopmentIdentityDisabled } from "@/lib/authPolicy";
import { credentialSessionValid } from "@/lib/auth/sessionCredential";
import { resolveImpersonationIdentity } from "@/lib/auth/impersonation";

export async function getAuthenticatedUser(request?: NextRequest) {
  const authRequest = request ?? new NextRequest("http://localhost", { headers: headers() });
  const token = await getToken({ req: authRequest, secret: process.env.NEXTAUTH_SECRET });

  if (typeof token?.id !== "string" || !token.id) return null;
  if (isDevelopmentIdentityDisabled(token.provider)) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: token.id },
    select: { id: true, role: true, password: true, suspendedAt: true, suspendedUntil: true, sessionVersion: true },
  });
  if (!user || isAccountSuspended(user) || !accountSessionValid(token.sessionVersion, user.sessionVersion) || !credentialSessionValid(token.provider, token.credentialStamp, user.password)) return null;
  const identity = await resolveImpersonationIdentity(prisma, token);
  return identity.user ? { id: identity.user.id, role: identity.user.role } : null;
}

export async function getAuthenticatedAdminId(request?: NextRequest): Promise<string | null> {
  const user = await getAuthenticatedUser(request);
  return user?.role === "ADMIN" ? user.id : null;
}
