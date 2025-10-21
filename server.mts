import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const prisma = new PrismaClient();
const activeUsers = new Map<string, string>();

let io: Server | null = null;

// ✅ Exporta a instância do Socket.IO
export const getIoServer = () => {
  if (!io) throw new Error("Socket.IO não inicializado");
  return io;
};

// Criação do usuário admin, caso não exista
export async function CreateAdminUser() {
  try {
    const existingAdmin = await prisma.user.findFirst({
      where: { role: "ADMIN" },
    });

    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash("admin123", 10);
      await prisma.user.create({
        data: {
          name: "Admin",
          email: "admin@meusistema.com",
          password: hashedPassword,
          role: "ADMIN",
          emailVerified: true,
        },
      });
      console.log("✅ Usuário ADMIN criado com sucesso!");
    } else {
      console.log("ℹ️ Usuário ADMIN já existe.");
    }
  } catch (err) {
    console.error("❌ Erro ao criar usuário ADMIN:", err);
  }
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  const httpServer = createServer(handle);
  io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  await CreateAdminUser();

  io.on("connection", (socket) => {
    console.log(`🟢 Usuário conectado: ${socket.id}`);

    // Registrar usuário ativo
    socket.on("register-user", (userId: string) => {
      socket.data.userId = userId;
      activeUsers.set(socket.id, userId);
      console.log(`✔️ Socket ${socket.id} associado ao usuário ${userId}`);
      io!.emit("active-users", Array.from(activeUsers.values()));
    });


    socket.on("request-update-users", async () => {
      try {
        const allUsers = await prisma.user.findMany();
        // Só envia para admins
        socket.to("admins").emit("update-users", allUsers);
      } catch (err) {
        console.error("Erro ao buscar usuários para update:", err);
      }
    });

    // Solicitar lista de usuários ativos
    socket.on("request-active-users", () => {
      socket.emit("active-users", Array.from(activeUsers.values()));
    });

    // Atualizar role do usuário
    socket.on("role-updated", ({ userId, newRole }) => {
      const targetSocket = Array.from(io!.sockets.sockets.values()).find(
        (s) => s.data.userId === userId
      );
      if (targetSocket) {
        targetSocket.emit("role-mudar", { newRole });
      }
    });

    // Desconexão do usuário
    socket.on("user-disconnected", (userId: string) => {
      console.log(`🔴 Usuário desconectou: ${userId}`);
      Array.from(activeUsers.entries()).forEach(([socketId, id]) => {
        if (id === userId) activeUsers.delete(socketId);
      });
      io!.emit("active-users", Array.from(activeUsers.values()));
    });
  });

  httpServer.listen(port, () => {
    console.log(`🚀 Ready on http://${hostname}:${port}`);
  });
});
