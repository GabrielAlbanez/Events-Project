import { NextRequest, NextResponse } from 'next/server';
import { getForEventsForUserById } from '@/app/(actions)/getForEventsByUserId/action';
import { getAuthenticatedUser } from '@/lib/adminAuth';

export async function POST(req: NextRequest) {
  try {
    const { idUser } = await req.json();

    if (!idUser) {
      console.error("ID do usuário não encontrado.");
      return NextResponse.json(
        { status: "error", message: "ID do usuário não fornecido." },
        { status: 400 }
      );
    }

    const authenticatedUser = await getAuthenticatedUser(req);
    if (!authenticatedUser || (authenticatedUser.id !== idUser && authenticatedUser.role !== "ADMIN")) {
      return NextResponse.json({ status: "error", message: "Acesso negado." }, { status: 403 });
    }

    const result = await getForEventsForUserById(idUser);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Erro na rota:", error);
    return NextResponse.json(
      { status: "error", message: "Erro interno do servidor." },
      { status: 500 }
    );
  }
}
