"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sun, Moon } from "lucide-react";

export function ThemeSwitcher() {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const ready = mounted && resolvedTheme !== undefined;
  const isDark = ready && resolvedTheme === "dark";
  const label = isDark ? "Ativar tema claro" : "Ativar tema escuro";

  return (
    <Button
      type="button"
      variant="ghost"
      className="h-11 rounded-xl px-3 text-violet-700 hover:bg-violet-100 focus-visible:ring-2 dark:text-violet-300 dark:hover:bg-violet-400/10"
      disabled={!ready}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={ready ? label : "Carregando tema"}
      title={ready ? label : "Carregando tema"}
    >
      {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      <span>{ready ? (isDark ? "Tema claro" : "Tema escuro") : "Tema"}</span>
    </Button>
  );
}
