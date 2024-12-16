"use client";
import Mapa from "@/components/MyComponents/Map";

export default function Home() {
  return (
    <div className="relative h-screen w-screen">
      {/* Renderiza o Mapa como Background */}
      <div className="absolute inset-0 z-40">
        <Mapa />
      </div>

      {/* Conteúdo da UI sobre o Mapa */}
      <div className="relative z-10 flex flex-col justify-center items-center h-full p-4">

      </div>
    </div>
  );
}
