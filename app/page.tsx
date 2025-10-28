"use client";

import Mapa from "@/components/MyComponents/Map";

export default function Home() {




  return (
    <div className="relative h-screen w-screen">
      {/* Renderiza o Mapa como Background */}
      <div className=" inset-0 z-40">
        <Mapa />
      </div>
    </div>
  );
}
