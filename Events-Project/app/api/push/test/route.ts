import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/adminAuth";
import { isAllowedRequestOrigin } from "@/lib/publicUrl";
import { createNotification } from "@/lib/notifications/create";
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request, { allowImpersonation: false });
  if (!user || !isAllowedRequestOrigin(request)) return NextResponse.json({ success: false, message: "Acesso negado." }, { status: 403 });
  if (!process.env.WEB_PUSH_PUBLIC_KEY || !process.env.WEB_PUSH_PRIVATE_KEY || !process.env.WEB_PUSH_SUBJECT) return NextResponse.json({ success: false, message: "O envio ainda não foi configurado." }, { status: 503 });
  try {
    const status = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"notification-test:" + user.id}))::text`;
      if (!await tx.pushSubscription.count({ where: { userId: user.id } })) return 409;
      if (await tx.notification.count({ where: { userId: user.id, groupKey: "push-test", createdAt: { gte: new Date(Date.now() - 60000) } } })) return 429;
      await createNotification(tx, { userId: user.id, type: "SYSTEM", title: "Seu teste de notificação", message: "Os avisos deste navegador estão prontos para você.", href: "/notificacoes", groupKey: "push-test" });
      return 200;
    });
    return NextResponse.json({ success: status === 200, message: status === 200 ? "Teste solicitado. O aviso pode levar até um minuto para chegar." : status === 429 ? "Aguarde um minuto antes de testar novamente." : "Ative os avisos neste navegador antes de testar." }, { status });
  } catch { return NextResponse.json({ success: false, message: "Não foi possível enviar o teste. Tente novamente." }, { status: 503 }); }
}
