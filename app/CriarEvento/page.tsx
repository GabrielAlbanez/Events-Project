"use client";

import { EventoForm } from "@/components/MyComponents/EventoForm";
import { SidebarTrigger } from "@/components/ui/sidebar";

export default function CriarEvento() {

  // Define classes dinâmicas baseadas no tema
 
  return (
    <div className={`flex-1  flex flex-col gap-6 items-center justify-center p-6 `}>
      {/* Conteúdo principal */}
      <div className={`w-full max-w-3xl  p-4 rounded-lg shadow-lg`}>
        <div className="flex items-start p-6">
          <SidebarTrigger>
            <button className="text-default hover:text-gray-400 mr-3">
              ☰
            </button>
          </SidebarTrigger>
        </div>
        <h1 className={`text-3xl font-bold text-center mb-6 `}>
          Criar Eventos
        </h1>
        <EventoForm />
      </div>
    </div>
  );
}
