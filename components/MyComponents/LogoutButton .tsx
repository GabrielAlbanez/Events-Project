"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useSocket } from "@/context/SocketContext";

export function LogoutButton() {
  const router = useRouter();
  const socket = useSocket()
  const handleLogout = async () => {
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          try {
            await fetch("/api/push/subscriptions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
          } finally {
            await subscription.unsubscribe();
          }
        }
      } catch {
        // Signing out remains available when browser push is unavailable.
      }
    }
    if (socket.connected) socket.emit("user-disconnected");
    socket.disconnect();
    await signOut({ callbackUrl: "/login" }); // Redireciona para a página inicial após logout
    router.refresh(); // Garante que o estado seja atualizado
  };

  return (
    <Button variant="outline" className="mt-3 w-full rounded-xl" onClick={handleLogout}>
      Sair da conta
    </Button>
  );
}
