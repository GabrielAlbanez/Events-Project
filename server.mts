import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { PrismaClient, Prisma } from "@prisma/client";
import _ from "lodash"; // Biblioteca para comparação profunda
import bcrypt from "bcrypt";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const prisma = new PrismaClient();
// console.log(
//   "📢 [PRISMA] Modelos disponíveis:",
//   Object.values(Prisma.ModelName)
// );



export async function CreateADminUser() {
  try {
    // Verifica se já existe um admin
    const existingAdmin = await prisma.user.findFirst({
      where: { role: "ADMIN" },
    });

    if (!existingAdmin) {
      // Cria o admin caso não exista
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

let io: Server | null = null;
let lastEvents: any[] = []; // Cache dos eventos anteriores
let lastUsers: any[] = []; // Cache dos usuários anteriores
const activeUsers = new Map<string, string>();

app.prepare().then(async () => {
  const httpServer = createServer(handle);
  io = new Server(httpServer);
  await CreateADminUser();

  io.on("connection", (socket) => {
    console.log(`🟢 user connected: ${socket.id}`);
  
    socket.on("register-user", (userId) => {
      socket.data.userId = userId;
      activeUsers.set(socket.id, userId);
      console.log(`✔️ Socket ${socket.id} associado ao usuário ${userId}`);
      io!.emit("active-users", Array.from(activeUsers.values()));
    });
  
    socket.on("request-active-users", () => {
      socket.emit("active-users", Array.from(activeUsers.values()));
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
  
    socket.on("user-disconnected", (userId: string) => {
      console.log(`🔴 Usuário fechou a aba: ${userId}`);
      Array.from(activeUsers.entries()).forEach(([socketId, id]) => {
        if (id === userId) activeUsers.delete(socketId);
      });
      io!.emit("active-users", Array.from(activeUsers.values()));
    });
  
  }); // <-- FECHOU O io.on("connection") CORRETAMENTE

  httpServer.listen(port, () => {
    console.log(`🚀 Ready on http://${hostname}:${port}`);
  });

  // // Monitorando banco para mudanças nos eventos
  // setInterval(async () => {
  //   try {
  //     const currentEvents = await prisma.events.findMany({
  //       include: { validator: true },
  //     });

  //     if (!_.isEqual(currentEvents, lastEvents)) {
  //       io!.emit("update-events", currentEvents);
  //       lastEvents = currentEvents;
  //     }
  //   } catch (error) {
  //     console.error("Erro ao verificar mudanças em events:", error);
  //   }
  // }, 5000);

  // // Monitorando banco para mudanças nos usuários
  // setInterval(async () => {
  //   try {
  //     const currentUsers = await prisma.user.findMany();

  //     if (!_.isEqual(currentUsers, lastUsers)) {
  //       io!.emit("update-users", currentUsers);
  //       lastUsers = currentUsers;
  //     }
  //   } catch (error) {
  //     console.error("Erro ao verificar mudanças em users:", error);
  //   }
  // }, 5000);
});

// Middleware do Prisma para capturar mudanças nas tabelas
// prisma.$use(async (params, next) => {
//   const result = await next(params);

//   if (
//     params.model &&
//     params.model.toLowerCase() === "events" &&
//     ["create", "update", "delete"].includes(params.action)
//   ) {
//     try {
//       const updatedEvents = await prisma.events.findMany({
//         include: { validator: true },
//       });
//       io?.emit("update-events", updatedEvents);
//       lastEvents = updatedEvents;
//     } catch (error) {
//       console.error("Erro ao emitir atualização de eventos:", error);
//     }
//   }

//   if (
//     params.model &&
//     params.model.toLowerCase() === "users" &&
//     ["create", "update", "delete"].includes(params.action)
//   ) {
//     try {
//       const updatedUsers = await prisma.user.findMany();
//       io?.emit("update-users", updatedUsers);
//       lastUsers = updatedUsers;
//     } catch (error) {
//       console.error("Erro ao emitir atualização de usuários:", error);
//     }
//   }



  

//   return result;
// });


