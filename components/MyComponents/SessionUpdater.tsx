"use client"
import { useEffect } from "react";
import { getSession, signOut, useSession } from "next-auth/react";
import { useSocket } from "@/context/SocketContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";

interface RoleUpdatedPayload {
  userId: string;
  newRole: string;
}

const SessionUpdater = () => {
  const { socket } = useSocket();
  const {data,status,update} = useCurrentUser()

  useEffect(() => {
    if (!socket) return;

    socket.on("roleUpdated", async (payload: RoleUpdatedPayload) => {

      // Verifique se o ID do evento corresponde ao usuário logado
      if (data?.id === payload.userId) {
        console.log(`Your role has been updated to: ${payload.newRole}`);
        // Atualize a sessão ou faça logout, se necessário
        update();
      }
    });

    return () => {
      socket.off("roleUpdated");
    };
  }, [socket]);

  return null;
};

export default SessionUpdater;
