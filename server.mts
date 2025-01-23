import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";


const dev = process.env.NODE_ENV !== "production";

const hostname = process.env.HOSTAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });

//esse handle ajuda a criar o servidor
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(handle);

  //esse io e uma room ou quarto para que podemos ter varios sockets, varios usarios

  const io = new Server(httpServer);

  io.on("connection", (socket) => {
    console.log(`user connected: ${socket.id}`);

    socket.on("register-user", (userId) => {
      socket.data.userId = userId;
      console.log(`teste ${userId}`);
      console.log(`Socket ${socket.id} associado ao usuário ${userId}`);
    });

    socket.on("teste", () => {
      console.log("teste");
    });

    socket.on("role-updated", ({ userId, newRole }) => {
      console.log("entrou no role updated");
      const targetSocket = Array.from(io.sockets.sockets.values()).find(
        (s) => s.data.userId === userId
      );

      if (targetSocket) {
        targetSocket.emit("role-mudar", { newRole });
      }
    });

    socket.on("create-event",  ({ user }) => {
      try {
        console.log("Evento criado por:", user.nome);

        // Busca os eventos do banco
        // const dataEvents =  getAllDataEvents();

        // // Emite os eventos atualizados
        // io.emit("allEvents", dataEvents);
      } catch (error) {
        console.error("Erro ao criar evento:", error);
      }
    });

    socket.on("join-room", ({ room, username }) => {
      socket.join(room);
      console.log(`user ${username} joined room ${room}`);
    });

    socket.on("disconnect", () => {
      console.log(`user disconnected: ${socket.id}`);
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
