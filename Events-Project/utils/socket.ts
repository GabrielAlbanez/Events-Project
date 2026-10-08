import type { Socket } from "socket.io-client";
import { socket } from "@/lib/socketClient";

type RoleUpdatedPayload = { newRole: string };

/** Compatibilidade com consumidores antigos; a conexão é compartilhada. */
export const initSocket = (): Socket => socket;

export const listenToRoleUpdates = (
  callback: (payload: RoleUpdatedPayload) => void
): (() => void) => {
  socket.on("role-mudar", callback);
  return () => { socket.off("role-mudar", callback); };
};
