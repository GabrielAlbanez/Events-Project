import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

/**
 * O Socket.IO é inicializado pelo servidor customizado em `server.mts`.
 * Esta rota existe apenas como verificação de disponibilidade da API.
 */
export async function GET() {
  return NextResponse.json({
    service: "socket.io",
    status: process.env.EVENTMAP_SOCKET_SERVER === "true" ? "available" : "disabled",
    enabled: process.env.EVENTMAP_SOCKET_SERVER === "true",
  }, { headers: { "Cache-Control": "no-store" } });
}
