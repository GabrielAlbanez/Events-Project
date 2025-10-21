"use client";

import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useSocket } from "@/context/SocketContext";

export function LogoutButton() {
  const router = useRouter();
  const socket = useSocket()
  const {data : session} = useSession();

  const handleLogout = async () => {
    socket.emit("user-disconnected", session?.user?.id);
    await signOut({ callbackUrl: "/login" }); // Redireciona para a página inicial após logout
    router.refresh(); // Garante que o estado seja atualizado
  };

  return (
    <Button variant="outline" className="w-full mt-4" onClick={handleLogout}>
      Logout
    </Button>
  );
}
