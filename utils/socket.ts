import { io, Socket } from "socket.io-client";

interface RoleUpdatedPayload {
  userId: string;
  newRole: string;
}

let socket: Socket;

export const initSocket = (): Socket => {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3000", {
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      console.log("Connected to WebSocket server");
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from WebSocket server");
    });
  }
  return socket;
};

export const listenToRoleUpdates = (
  callback: (payload: RoleUpdatedPayload) => void
): void => {
  if (!socket) {
    throw new Error("Socket not initialized. Call initSocket first.");
  }

  socket.on("roleUpdated", callback);
};
