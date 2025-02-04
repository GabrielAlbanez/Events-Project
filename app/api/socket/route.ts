import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";

let io: SocketIOServer | undefined;

export default function handler(req: any, res: any) {
  if (!io) {
    const httpServer: HttpServer = res.socket.server;
    io = new SocketIOServer(httpServer, {
      path: "/api/socket",
    });

    io.on("connection", (socket) => {
      console.log("New client connected:", socket.id);

      socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
      });
    });

    res.socket.server.io = io;
  }

  res.end();
}

export const getIO = () => io;
