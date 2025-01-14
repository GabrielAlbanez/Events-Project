"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sun, Moon } from "lucide-react";

export function ThemeSwitcher() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="flex items-center space-x-4">
      {theme === "dark" ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setTheme("light")}
          aria-label="Ativar modo claro"
        >
          <Moon className="h-5 w-5 text-blue-500" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setTheme("dark")}
          aria-label="Ativar modo escuro"
        >
          <Sun className="h-5 w-5 text-yellow-500" />
        </Button>
      )}
    </div>
  );
}
