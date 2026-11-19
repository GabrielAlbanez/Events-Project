import prisma from "@/lib/prisma";
import { createNotifications, type CreateNotificationInput } from "@/lib/notifications/create";
import { notificationText } from "@/lib/notifications/catalog";
import type { ResolveCurrentUser } from "@/lib/services/authContext";
import { suspensionActive } from "@/lib/services/userSuspension";
import { sendOrganizerMail } from "./mail";
import {
  eventClaimSchema, firstFieldErrors, maxDailyEventClaims, organizerRequestSchema, organizerRequestWindowMs, transferOwnershipSchema,
  type OrganizerActionResult, type OrganizerRequest,
} from "./schema";

type Clock = () => Date;
const genericError: OrganizerActionResult = { success: false, message: "Não foi possível enviar agora. Tente novamente em alguns minutos." };
const interestTitles: Record<OrganizerRequest["interest"], string> = {
  access: "Pedido de acesso de organizador",
  plans: "Interesse nos planos Pro/Enterprise",
};

/** Access requests and plan-interest sign-ups have separate 24h windows, so joining the list never blocks an access request. */
export function organizerRequestKey(userId: string, interest: OrganizerRequest["interest"] = "access") { return interest === "plans" ? `organizer-plans:${userId}` : `organizer-request:${userId}`; }
export function eventClaimKey(userId: string, eventId: string) { return `event-claim:${userId}:${eventId}`; }
export function adminUserHref(email: string) { return `/admin?q=${encodeURIComponent(email)}`; }

/** Builds the 160-character admin notice, keeping the most useful fields first. */
export function organizerRequestNotice(requester: { name: string | null; email: string }, request: OrganizerRequest) {
  const who = requester.name?.trim() || requester.email;
  const parts = [who, request.brandName, request.city, request.eventType, request.link, request.message].filter(Boolean);
  return { title: interestTitles[request.interest], message: notificationText(parts.join(" · "), 160) };
}

/**
 * Notice for an account that an admin just promoted to PROMOTER. Kept here so the role-change
 * service can create it inside its own transaction: `createNotifications(tx, [organizerPromotionNotice(id)])`.
 */
export function organizerPromotionNotice(userId: string): CreateNotificationInput {
  return { userId, type: "ADMIN", title: "Sua conta pode publicar eventos", message: "Seu acesso de organizador foi liberado. Crie seu primeiro evento e acompanhe inscrições e check-ins.", href: "/CriarEvento", groupKey: `organizer-promoted:${userId}` };
}

function organizerRequestMail(requester: { name: string | null; email: string }, request: OrganizerRequest) {
  return [
    `${interestTitles[request.interest]} no EventMap`,
    "",
    `Conta: ${requester.name?.trim() || "(sem nome)"} <${requester.email}>`,
    `Produtora ou marca: ${request.brandName}`,
    `Cidade: ${request.city}`,
    `Tipo de evento: ${request.eventType}`,
    `Instagram ou site: ${request.link || "não informado"}`,
    "",
    "Mensagem:",
    request.message || "(sem mensagem)",
    "",
    "Revise a conta no painel de administração do EventMap antes de alterar o papel para Promotor.",
  ].join("\n");
}

async function adminRecipients() {
  return prisma.user.findMany({ where: { role: "ADMIN", suspendedAt: null }, select: { id: true, email: true } });
}

async function notifyMailSafely(recipients: (string | null)[], subject: string, text: string) {
  try { await sendOrganizerMail(recipients.filter((email): email is string => Boolean(email)), subject, text); }
  catch { console.warn("organizer-mail-failed"); }
}

export async function submitOrganizerRequest(rawInput: unknown, resolveCurrentUser: ResolveCurrentUser, now: Clock = () => new Date()): Promise<OrganizerActionResult> {
  const user = await resolveCurrentUser();
  if (!user) return { success: false, message: "Entre na sua conta para enviar o pedido." };
  const parsed = organizerRequestSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, message: "Revise os campos destacados.", fieldErrors: firstFieldErrors(parsed.error) };
  const request = parsed.data;
  if (user.role === "ADMIN") return { success: false, message: "Sua conta de administrador já pode publicar eventos." };
  if (user.role === "PROMOTER" && request.interest === "access") return { success: false, message: "Sua conta já pode publicar eventos. Acesse Criar evento no menu." };
  if (user.role !== "BASIC" && user.role !== "PROMOTER") return { success: false, message: "Sua conta não pode enviar este pedido." };
  try {
    const requester = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true, email: true } });
    if (!requester?.email) return { success: false, message: "Sua conta precisa de um e-mail para enviar o pedido." };
    const account = { name: requester.name, email: requester.email };
    const admins = await adminRecipients();
    if (admins.length === 0) return { success: false, message: "Nenhum administrador está disponível para receber o pedido agora." };
    const groupKey = organizerRequestKey(user.id, request.interest);
    const adminIds = admins.map(admin => admin.id);
    const notice = organizerRequestNotice(account, request);
    const outcome = await prisma.$transaction(async tx => {
      // Serializes double submits from the same account before the 24h check.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${groupKey}))::text`;
      const recent = await tx.notification.findFirst({ where: { userId: { in: adminIds }, groupKey, createdAt: { gte: new Date(now().getTime() - organizerRequestWindowMs) } }, select: { id: true } });
      if (recent) return "limited" as const;
      const inputs: CreateNotificationInput[] = admins.map(admin => ({ userId: admin.id, type: "ADMIN", title: notice.title, message: notice.message, href: adminUserHref(account.email), groupKey }));
      await createNotifications(tx, inputs);
      return "sent" as const;
    });
    if (outcome === "limited") return { success: false, message: request.interest === "plans" ? "Seu interesse nos planos já foi registrado nas últimas 24 horas." : "Recebemos um pedido seu nas últimas 24 horas. A equipe vai analisar e responder pela sua central de notificações." };
    await notifyMailSafely(admins.map(admin => admin.email), interestTitles[request.interest], organizerRequestMail(account, request));
    return { success: true, message: request.interest === "plans" ? "Você entrou na lista de interesse. Avisaremos quando os planos estiverem definidos." : "Pedido enviado. A equipe vai analisar e você será avisado quando sua conta puder publicar eventos." };
  } catch {
    return genericError;
  }
}

export async function submitEventClaim(rawInput: unknown, resolveCurrentUser: ResolveCurrentUser, now: Clock = () => new Date()): Promise<OrganizerActionResult> {
  const user = await resolveCurrentUser();
  if (!user) return { success: false, message: "Entre na sua conta para se identificar como organizador." };
  if (user.role !== "BASIC" && user.role !== "PROMOTER") return { success: false, message: "Administradores podem transferir o evento direto pelo painel." };
  const parsed = eventClaimSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, message: "Revise os campos destacados.", fieldErrors: firstFieldErrors(parsed.error) };
  const claim = parsed.data;
  try {
    const event = await prisma.events.findFirst({ where: { id: claim.eventId, status: { in: ["PUBLISHED", "ENDED", "CANCELLED"] } }, select: { id: true, nome: true, userId: true, user: { select: { role: true } } } });
    if (!event) return { success: false, message: "Evento não encontrado." };
    if (event.userId === user.id) return { success: false, message: "Este evento já está na sua conta." };
    // Only events held by the platform (imported/curated by an admin) can be claimed.
    if (event.user?.role !== "ADMIN") return { success: false, message: "Este evento já tem um organizador responsável. Se algo estiver errado, use a opção de denúncia." };
    const requester = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true, email: true } });
    if (!requester?.email) return { success: false, message: "Sua conta precisa de um e-mail para enviar a solicitação." };
    const admins = await adminRecipients();
    if (admins.length === 0) return { success: false, message: "Nenhum administrador está disponível para receber a solicitação agora." };
    const groupKey = eventClaimKey(user.id, event.id);
    const userPrefix = `event-claim:${user.id}:`;
    const who = requester.name?.trim() || requester.email;
    const outcome = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userPrefix}))::text`;
      const since = new Date(now().getTime() - organizerRequestWindowMs);
      const recent = await tx.notification.findMany({ where: { userId: { in: admins.map(admin => admin.id) }, groupKey: { startsWith: userPrefix }, createdAt: { gte: since } }, distinct: ["groupKey"], select: { groupKey: true }, take: maxDailyEventClaims + 1 });
      if (recent.some(item => item.groupKey === groupKey)) return "duplicate" as const;
      if (recent.length >= maxDailyEventClaims) return "limited" as const;
      await createNotifications(tx, admins.map(admin => ({
        userId: admin.id, type: "ADMIN", groupKey, href: `/eventos/${event.id}`,
        title: notificationText(`Organizador reivindica "${event.nome}"`, 80),
        message: notificationText([`${who} (${requester.email})`, `Contato: ${claim.contact}`, claim.message].filter(Boolean).join(" · "), 160),
      })));
      return "sent" as const;
    });
    if (outcome === "duplicate") return { success: false, message: "Você já enviou uma solicitação para este evento nas últimas 24 horas." };
    if (outcome === "limited") return { success: false, message: `Você pode reivindicar até ${maxDailyEventClaims} eventos a cada 24 horas.` };
    await notifyMailSafely(admins.map(admin => admin.email), `Reivindicação de evento: ${event.nome}`, [
      `${who} <${requester.email}> informou ser organizador do evento "${event.nome}" (ID ${event.id}).`,
      `Contato informado: ${claim.contact}`, "", "Mensagem:", claim.message || "(sem mensagem)", "",
      "Confirme a identidade antes de transferir o evento no painel de administração do EventMap.",
    ].join("\n"));
    return { success: true, message: "Solicitação enviada. A equipe vai confirmar seus dados antes de transferir o evento para sua conta." };
  } catch {
    return genericError;
  }
}

export async function transferEventOwnership(rawInput: unknown, resolveCurrentUser: ResolveCurrentUser): Promise<OrganizerActionResult> {
  const user = await resolveCurrentUser();
  if (!user || user.role !== "ADMIN") return { success: false, message: "Apenas administradores podem transferir eventos." };
  const parsed = transferOwnershipSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, message: "Revise os campos destacados.", fieldErrors: firstFieldErrors(parsed.error) };
  const { eventId, newOwnerEmail } = parsed.data;
  try {
    const target = await prisma.user.findFirst({ where: { email: { equals: newOwnerEmail, mode: "insensitive" } }, select: { id: true, name: true, role: true, suspendedAt: true, suspendedUntil: true } });
    if (!target) return { success: false, message: "Nenhuma conta usa este e-mail.", fieldErrors: { newOwnerEmail: "Nenhuma conta usa este e-mail." } };
    if (suspensionActive(target)) return { success: false, message: "A conta de destino está suspensa." };
    if (target.role !== "PROMOTER" && target.role !== "ADMIN") return { success: false, message: "Altere o papel da conta para Promotor antes de transferir o evento.", fieldErrors: { newOwnerEmail: "A conta precisa ser Promotor." } };
    const actor = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });
    const outcome = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"event-owner:" + eventId}))::text`;
      const event = await tx.events.findUnique({ where: { id: eventId }, select: { id: true, nome: true, userId: true } });
      if (!event) return { kind: "missing" as const };
      if (event.userId === target.id) return { kind: "same" as const };
      const updated = await tx.events.updateMany({ where: { id: event.id, userId: event.userId }, data: { userId: target.id } });
      if (updated.count !== 1) return { kind: "conflict" as const };
      await tx.eventHistory.create({ data: { eventId: event.id, eventName: event.nome, promoterId: target.id, actorId: user.id, actorName: actor?.name ?? null, action: "UPDATED", note: "Responsável pelo evento transferido por um administrador." } });
      const notices: CreateNotificationInput[] = [{ userId: target.id, type: "EVENT_CHANGE", title: "Um evento foi transferido para você", message: notificationText(`"${event.nome}" agora está na sua conta. Revise os dados em Meus eventos.`, 160), href: "/myEvents", groupKey: `event-owner:${event.id}` }];
      if (event.userId && event.userId !== user.id) notices.push({ userId: event.userId, type: "EVENT_CHANGE", title: "Evento transferido", message: notificationText(`"${event.nome}" foi transferido para outro organizador pela administração.`, 160), href: "/myEvents", groupKey: `event-owner:${event.id}` });
      await createNotifications(tx, notices);
      return { kind: "done" as const, name: event.nome };
    });
    if (outcome.kind === "missing") return { success: false, message: "Evento não encontrado.", fieldErrors: { eventId: "Evento não encontrado." } };
    if (outcome.kind === "same") return { success: false, message: "Esta conta já é responsável pelo evento." };
    if (outcome.kind === "conflict") return { success: false, message: "O evento mudou durante a transferência. Tente novamente." };
    return { success: true, message: `"${outcome.name}" agora pertence a ${target.name?.trim() || newOwnerEmail}.` };
  } catch {
    return { success: false, message: "Não foi possível transferir o evento agora. Tente novamente." };
  }
}
