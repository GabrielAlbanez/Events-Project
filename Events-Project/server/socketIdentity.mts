import { isAccountSuspended, accountSessionValid } from "../lib/auth/accountAccess.js";
import type { PrismaClient } from "@prisma/client";
import type { JWT } from "next-auth/jwt";
import type { Socket, Server } from "socket.io";
import { credentialSessionValid } from "../lib/auth/sessionCredential.js";
import { endImpersonation, resolveImpersonationIdentity } from "../lib/auth/impersonation.js";

export type IdentityFailure = "ACCOUNT_SUSPENDED" | "ACCOUNT_REMOVED" | "SESSION_REVOKED" | "ACCOUNT_IMPERSONATED" | "IMPERSONATION_CHANGED";
export async function resolveSocketIdentity(prisma: PrismaClient, token: JWT): Promise<{ id: string; role: string } | IdentityFailure> {
  if (typeof token.id !== "string" || !token.id) return "SESSION_REVOKED";
  const original = await prisma.user.findUnique({ where: { id: token.id }, select: { id: true, password: true, suspendedAt: true, suspendedUntil: true, sessionVersion: true } });
  if (!original) { await endImpersonation(prisma, token); return "ACCOUNT_REMOVED"; }
  if (isAccountSuspended(original)) { await endImpersonation(prisma, token); return "ACCOUNT_SUSPENDED"; }
  if (!accountSessionValid(token.sessionVersion, original.sessionVersion)) return "SESSION_REVOKED";
  if (!credentialSessionValid(token.provider, token.credentialStamp, original.password)) {
    await endImpersonation(prisma, token); return "SESSION_REVOKED";
  }
  const identity = await resolveImpersonationIdentity(prisma, token);
  if (identity.blocked) return "ACCOUNT_IMPERSONATED";
  if (!identity.user) return "IMPERSONATION_CHANGED";
  if ("restoreRequired" in identity && identity.restoreRequired) return "IMPERSONATION_CHANGED";
  return { id: identity.user.id, role: identity.user.role };
}

export async function validateSocketIdentity(prisma: PrismaClient, socket: Socket): Promise<boolean> {
  if (!socket.connected || typeof socket.data.userId !== "string") return socket.connected;
  const token: JWT = {
    id: socket.data.authUserId ?? socket.data.userId,
    provider: socket.data.provider,
    credentialStamp: socket.data.credentialStamp,
    sessionVersion: socket.data.sessionVersion,
    impersonationId: socket.data.impersonationId,
    effectiveUserId: socket.data.userId,
    effectiveRole: socket.data.effectiveRole,
  };
  const identity = await resolveSocketIdentity(prisma, token);
  if (typeof identity === "string" || identity.id !== socket.data.userId || (socket.data.effectiveRole && identity.role !== socket.data.effectiveRole)) {
    if (!socket.connected) return false;
    socket.emit(identity === "ACCOUNT_SUSPENDED" ? "account-suspended" : identity === "ACCOUNT_REMOVED" ? "account-removed" : identity === "ACCOUNT_IMPERSONATED" ? "account-impersonated" : "session-expired");
    socket.disconnect(true); return false;
  }
  return socket.connected;
}

export async function emitAuthorizedRoom(prisma: PrismaClient, io: Server, room: string, event: string, payload?: unknown): Promise<void> {
  const members = Array.from(io.sockets.adapter.rooms.get(room) ?? []);
  for (let offset = 0; offset < members.length; offset += 25) {
    await Promise.all(members.slice(offset, offset + 25).map(async id => {
      const socket = io.sockets.sockets.get(id);
      if (socket?.connected && await validateSocketIdentity(prisma, socket)) socket.emit(event, payload);
    }));
  }
}
