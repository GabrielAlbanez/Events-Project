"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/login" }); // Redireciona para a página inicial após logout
    router.refresh(); // Garante que o estado seja atualizado
  };

  return (
    <Button variant="outline" className="w-full mt-4" onClick={handleLogout}>
      Logout
    </Button>
  );
}
