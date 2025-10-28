import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "8081", 10);

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

    // Only bootstrap an admin if explicitly allowed via env, and never use a weak default password
    if (!existingAdmin) {
      const adminEmail = "admin@admin.com";
      const adminPassword = "1234567890";
      if (!adminEmail || !adminPassword ) {
        console.warn("Skipping admin bootstrap: missing email/password or too weak.");
      } else {
      const hashedPassword = await bcrypt.hash(adminPassword, 12);
      await prisma.user.create({
        data: {
          name: "Admin",
          email: adminEmail,
          password: hashedPassword,
          role: "ADMIN",
          emailVerified: true,
        },
      });
      console.log("✅ Usuário ADMIN criado com sucesso!");
      }
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
      origin: (process.env.SOCKET_IO_ALLOWED_ORIGINS || "").split(",").filter(Boolean),
      methods: ["GET", "POST"],
      credentials: true,
    },
    cookie: {
      name: "io",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
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
      // Coloca o socket na sala 'admins' se a role atual for ADMIN
      prisma.user
        .findUnique({ where: { id: userId }, select: { role: true } })
        .then((user) => {
          if (!user) {
            console.warn(`⚠️ Usuário ${userId} não encontrado para atribuição de sala`);
            socket.leave("admins");
            return;
          }
          console.log(`🔎 Role atual do usuário ${userId}: ${user.role}`);
          if (user.role === "ADMIN") {
            socket.join("admins");
            console.log(`🔐 Socket ${socket.id} entrou na sala 'admins'`);
          } else {
            socket.leave("admins");
            console.log(`ℹ️ Socket ${socket.id} não é admin; removido da sala 'admins' se estava`);
          }
        })
        .catch((err) => console.error("Erro ao verificar role do usuário:", err));
    });


    socket.on("request-update-users", async () => {
      try {
        const allUsers = await prisma.user.findMany({
          select: { id: true, name: true, email: true, role: true, image: true },
        });
        // Só envia para admins
        io!.to("admins").emit("update-users", allUsers);
        const recipients = io!.sockets.adapter.rooms.get("admins")?.size || 0;
        console.log(`Atualização de usuários emitida para sala 'admins' (${recipients} destinatário[s])`);
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
        if (newRole === "ADMIN") {
          targetSocket.join("admins");
        } else {
          targetSocket.leave("admins");
        }
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
