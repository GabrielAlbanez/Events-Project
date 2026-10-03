import type { Socket } from "socket.io";
import type { PrismaClient } from "@prisma/client";
import { credentialSessionValid } from "../lib/auth/sessionCredential.js";

/** Check private operations against the current credential before dispatching them. */
export function enforceSocketCredentials(prisma: PrismaClient, socket: Socket): void {
  socket.use(async (_packet, next) => {
    if (socket.data.provider !== "credentials") { next(); return; }
    try {
      const user = await prisma.user.findUnique({ where: { id: socket.data.userId }, select: { password: true } });
      if (!socket.connected || !user || !credentialSessionValid(socket.data.provider, socket.data.credentialStamp, user.password)) {
        if (socket.connected) { socket.emit("session-expired"); socket.disconnect(true); }
        next(new Error("Socket session revoked")); return;
      }
      next();
    } catch { next(new Error("Unable to verify socket session")); }
  });
}

/** A socket cannot keep private room access beyond the JWT that authenticated it. */
export function enforceSocketExpiration(socket: Socket, expiresAt: number): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expire = () => {
    if (!socket.connected) return;
    socket.emit("session-expired");
    socket.disconnect(true);
  };

  const schedule = () => {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) { expire(); return; }
    timer = setTimeout(schedule, Math.min(remaining, 2_147_483_647));
    timer.unref();
  };

  socket.use((_packet, next) => {
    if (Date.now() >= expiresAt) {
      expire();
      next(new Error("Socket session expired"));
      return;
    }
    next();
  });
  socket.on("disconnect", () => { if (timer) clearTimeout(timer); });
  schedule();
}
