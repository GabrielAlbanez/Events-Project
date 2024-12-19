"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const handleLogout = async () => {
    await signOut({ callbackUrl: "/" }); // Redireciona para a página inicial após logout
  };

  return (
    <Button
      variant="outline"
      className="w-full mt-4"
      onClick={handleLogout}
    >
      Logout
    </Button>
  );
}
