"use client";

import EventoForm from "@/components/MyComponents/EventoForm";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useTheme } from "next-themes";

export default function CriarEvento() {
  const { theme } = useTheme();

  // Define classes dinâmicas baseadas no tema
  const pageBg = theme === "dark" ? "bg-black/40 text-gray-100" : "bg-white/90";
  const cardBg = theme === "dark" ? "bg-black/90 text-white" : "bg-white text-gray-800";
  const titleColor = theme === "dark" ? "text-gray-100" : "text-gray-800";

  return (
    <div className={`flex-1  flex flex-col gap-6 items-center justify-center p-6 ${pageBg}`}>
      {/* Conteúdo principal */}
      <div className={`w-full max-w-3xl ${cardBg} p-4 rounded-lg shadow-lg`}>
        <div className="flex items-start p-6">
          <SidebarTrigger>
            <button className="text-default hover:text-gray-400 mr-3">
              ☰
            </button>
          </SidebarTrigger>
        </div>
        <h1 className={`text-3xl font-bold text-center mb-6 ${titleColor}`}>
          Criar Eventos
        </h1>
        <EventoForm />
      </div>
    </div>
  );
}
