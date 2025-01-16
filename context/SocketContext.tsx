"use client";

import { createContext, useContext, useEffect } from "react";
import { socket } from "@/lib/socketClient"; // Reutiliza a instância do socket
import { useSession } from "next-auth/react";
import { Socket } from "socket.io-client";
import { ReactNode } from "react";
import { toast } from "react-toastify";

// Criação do contexto para o socket
const SocketContext = createContext<Socket | null>(null);

interface SocketProviderProps {
  children: ReactNode;
}

// Provedor do contexto Socket.IO
export const SocketProvider = ({ children }: SocketProviderProps) => {
  const { data: session, update } = useSession();

  useEffect(() => {
    if (session?.user) {
      // Envia o evento de registro ao conectar
      socket.emit("register-user", session.user.id);
      console.log(`Usuário registrado no Socket.IO: ${session.user.id}`);
    }

    // Cleanup: desconecta o socket ao desmontar o componente
    return () => {

    };
  }, [session]);

  useEffect(() => {
    const handleRoleChange = ({ newRole }: { newRole: string }) => {
      toast.success(`Sua role agora é ${newRole}`);
      update(); // Atualiza a sessão
    };

    // Escuta o evento 'role-mudar' apenas uma vez
    socket.on("role-mudar", handleRoleChange);

    // Remove o listener ao desmontar
    return () => {
      socket.off("role-mudar", handleRoleChange);
    };
  }, [update]);

  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
};

// Hook para usar o contexto do socket
export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket deve ser usado dentro de um SocketProvider");
  }
  return context;
};
