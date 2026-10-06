import { NextResponse } from "next/server";

/**
 * O Socket.IO é inicializado pelo servidor customizado em `server.mts`.
 * Esta rota existe apenas como verificação de disponibilidade da API.
 */
export async function GET() {
  return NextResponse.json({
    service: "socket.io",
    status: "available",
  });
}
