import type { Socket } from "socket.io";

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
