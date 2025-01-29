import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { PrismaClient, Prisma } from "@prisma/client";
import _ from "lodash"; // Biblioteca para comparação profunda

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const prisma = new PrismaClient();
console.log(
  "📢 [PRISMA] Modelos disponíveis:",
  Object.values(Prisma.ModelName)
);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

let io: Server | null = null;
let lastEvents: any[] = []; // 🔹 Cache dos eventos anteriores

app.prepare().then(async () => {
  const httpServer = createServer(handle);
  io = new Server(httpServer);

  io.on("connection", (socket) => {
    console.log(`🟢 user connected: ${socket.id}`);

    socket.on("register-user", (userId) => {
      socket.data.userId = userId;
      console.log(`✔️ Socket ${socket.id} associado ao usuário ${userId}`);
    });

    socket.on("role-updated", ({ userId, newRole }) => {
      console.log("🔄 entrou no role updated");
      const targetSocket = Array.from(io!.sockets.sockets.values()).find(
        (s) => s.data.userId === userId
      );

      if (targetSocket) {
        targetSocket.emit("role-mudar", { newRole });
      }
    });

    socket.on("join-room", ({ room, username }) => {
      socket.join(room);
      console.log(`📌 user ${username} joined room ${room}`);
    });

    socket.on("disconnect", () => {
      console.log(`🔴 user disconnected: ${socket.id}`);
    });
  });

  httpServer.listen(port, () => {
    console.log(`🚀 Ready on http://${hostname}:${port}`);
  });

  // 🔥 **Monitorando banco para mudanças**
  setInterval(async () => {
    try {

      const currentEvents = await prisma.events.findMany({
        include: {
          validator: true, // 🔹 Inclui os dados do validador
        },
      });

      if (!_.isEqual(currentEvents, lastEvents)) {
        // 🔄 Somente emite se houver mudanças
        io!.emit("update-events", currentEvents);
        lastEvents = currentEvents; // Atualiza o cache
      } else {
      }
    } catch (error) {}
  }, 5000); // Verifica mudanças a cada 5 segundos
});

// 🔥 **Middleware do Prisma para capturar eventos no banco e emitir via WebSocket**
prisma.$use(async (params, next) => {
  const result = await next(params);

  if (
    params.model &&
    params.model.toLowerCase() === "events" &&
    ["create", "update", "delete"].includes(params.action)
  ) {
    try {
      const updatedEvents = await prisma.events.findMany({
        include: {
          validator: true, // 🔹 Inclui os dados do validador
        },
      });

      if (!_.isEqual(updatedEvents, lastEvents)) {
        // 🔄 Somente emite se houver mudanças
        io?.emit("update-events", updatedEvents);
        lastEvents = updatedEvents; // Atualiza o cache
      } else {
      }
    } catch (error) {}
  }

  return result;
});
