import { createNotification, createNotificationOnce } from "@/lib/notifications/create";
import { notificationCopy } from "@/lib/notifications/catalog";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma, RegistrationStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { withEventLock } from "@/lib/eventLock";
import { signalRegistrationChange } from "@/lib/registrationSignals";
import { eventInstant } from "@/lib/eventTime";
import { sellerAccountActive, ticketPaymentsConfigured } from "@/lib/ticketSecurity";

const tokenLifetimeMs = 5 * 60 * 1000;
const retryLimit = 3;

export class AttendanceError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

function isRetryable(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

async function serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < retryLimit; attempt++) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!isRetryable(error) || attempt === retryLimit - 1) throw error;
    }
  }
  throw new AttendanceError("Não foi possível concluir a operação. Tente novamente.", 503);
}

function assertOpen(event: { status: string; dataInicio: string; startTime: string | null; timezone: string }): void {
  const start = eventInstant(event.dataInicio, event.startTime, event.timezone);
  if (event.status !== "PUBLISHED" || !start || start.getTime() <= Date.now()) {
    throw new AttendanceError("As inscrições deste evento estão encerradas.", 409);
  }
}

async function eventForRegistration(tx: Prisma.TransactionClient, eventId: string) {
  const event = await tx.events.findUnique({ where: { id: eventId }, select: {
    id: true, nome: true, status: true, dataInicio: true, startTime: true, timezone: true,
    capacity: true, userId: true, ticketsEnabled: true, isFree: true, requiresApproval: true, aiImport: { select: { id: true } },
  } });
  if (!event) throw new AttendanceError("Evento não encontrado.", 404);
  return event;
}

/** Organizer approval applies only to events created on EventMap; imported events keep the direct flow. */
export function needsApproval(event: { requiresApproval: boolean; aiImport: { id: string } | null }): boolean {
  return event.requiresApproval && !event.aiImport;
}

function sellsTickets(event: { ticketsEnabled: boolean; isFree: boolean }): boolean {
  return event.ticketsEnabled && !event.isFree;
}

/** On a paid event a seat is only valid with a PAID order, even if an older free RSVP still reads CONFIRMED. */
async function assertPaidSeat(db: Pick<Prisma.TransactionClient, "ticketOrder">, event: { id: string; ticketsEnabled: boolean; isFree: boolean }, userId: string): Promise<void> {
  if (!sellsTickets(event)) return;
  const paid = await db.ticketOrder.count({ where: { eventId: event.id, buyerId: userId, status: "PAID" } });
  if (!paid) throw new AttendanceError("Pagamento não confirmado para este ingresso.", 409);
}

async function promoteWaiting(tx: Prisma.TransactionClient, eventId: string, freePlaces: number): Promise<number> {
  if (freePlaces <= 0) return 0;
  const next = await tx.eventRegistration.findMany({
    where: { eventId, status: "WAITLISTED" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: freePlaces,
  });
  for (const registration of next) {
    await tx.eventRegistration.update({ where: { id: registration.id }, data: { status: "CONFIRMED" } });
    await createNotification(tx, notificationCopy({ ...{
      userId: registration.userId,
      href: `/eventos/${eventId}`,
      title: "Sua presença foi confirmada",
      message: "Uma vaga abriu no evento. Sua inscrição foi confirmada.",
    }, type: "CHECKIN" }));
    await signalRegistrationChange(tx, eventId, [registration.userId]);
  }
  return next.length;
}

/** Call after publishing an event whose capacity increased; safe to repeat. */
export async function reconcileEventWaitlist(eventId: string): Promise<number> {
  return serializable(async (tx) => {
    const event = await eventForRegistration(tx, eventId);
    const start = eventInstant(event.dataInicio, event.startTime, event.timezone);
    if (event.status !== "PUBLISHED" || !start || start.getTime() <= Date.now() || sellsTickets(event)) return 0;
    const occupied = await tx.eventRegistration.count({ where: { eventId, status: { in: ["CONFIRMED", "CHECKED_IN"] } } });
    const waiting = await tx.eventRegistration.count({ where: { eventId, status: "WAITLISTED" } });
    const freePlaces = event.capacity === null ? waiting : Math.max(0, event.capacity - occupied);
    return promoteWaiting(tx, eventId, Math.min(waiting, freePlaces));
  });
}

export async function getRegistrationState(eventId: string, userId: string | null) {
  const event = await prisma.events.findUnique({ where: { id: eventId }, select: {
    id: true, status: true, capacity: true, userId: true, ticketsEnabled: true, isFree: true, requiresApproval: true, aiImport: { select: { id: true } },
  } });
  if (!event) throw new AttendanceError("Evento não encontrado.", 404);
  const [confirmedCount, waitingCount, registration] = await Promise.all([
    prisma.eventRegistration.count({ where: { eventId, status: { in: ["CONFIRMED", "CHECKED_IN"] } } }),
    prisma.eventRegistration.count({ where: { eventId, status: "WAITLISTED" } }),
    userId ? prisma.eventRegistration.findUnique({ where: { eventId_userId: { eventId, userId } }, select: { id: true, status: true, createdAt: true, checkedInAt: true } }) : Promise.resolve(null),
  ]);
  const sellsTickets = Boolean(event.ticketsEnabled && !event.isFree);
  const canSell = sellsTickets && ticketPaymentsConfigured() && await sellerAccountActive(prisma, event.userId);
  // ticketSalesPaused: EventMap sells this event, but payments or the seller account are off right now (no free RSVP either).
  return { capacity: event.capacity, confirmedCount, waitingCount, registration, requiresApproval: needsApproval(event), ticketSale: canSell, ticketSalesPaused: sellsTickets && !canSell };
}

export async function registerForEvent(eventId: string, userId: string) {
  return withEventLock(eventId, async (tx) => {
    const event = await eventForRegistration(tx, eventId);
    assertOpen(event);
    if (event.userId === userId) throw new AttendanceError("O organizador não pode se inscrever no próprio evento.", 409);
    if (needsApproval(event)) return requestApproval(tx, event, userId);
    // While EventMap sells the tickets, the registration (and its QR) comes only from a paid order.
    // Also while payments or the seller account are off: a paid event never turns into a free RSVP.
    if (event.ticketsEnabled && !event.isFree) {
      throw new AttendanceError(ticketPaymentsConfigured() && await sellerAccountActive(tx, event.userId) ? "Este evento vende ingressos pelo EventMap. Compre seu ingresso para participar." : "As vendas deste evento estão pausadas no momento.", 409);
    }
    const existing = await tx.eventRegistration.findUnique({ where: { eventId_userId: { eventId, userId } } });
    if (existing && existing.status !== "CANCELLED") return { id: existing.id, status: existing.status };
    let confirmedCount = await tx.eventRegistration.count({ where: { eventId, status: { in: ["CONFIRMED", "CHECKED_IN"] } } });
    if (event.capacity === null || confirmedCount < event.capacity) {
      const openPlaces = event.capacity === null
        ? await tx.eventRegistration.count({ where: { eventId, status: "WAITLISTED" } })
        : event.capacity - confirmedCount;
      await promoteWaiting(tx, eventId, openPlaces);
      confirmedCount = await tx.eventRegistration.count({ where: { eventId, status: { in: ["CONFIRMED", "CHECKED_IN"] } } });
    }
    const status: RegistrationStatus = event.capacity !== null && confirmedCount >= event.capacity ? "WAITLISTED" : "CONFIRMED";
    // Existing registrations keep their original identity, while QR versions rotate on re-entry.
    const registration = existing
      ? await tx.eventRegistration.update({ where: { id: existing.id }, data: { status, qrVersion: { increment: 1 }, checkedInAt: null, createdAt: new Date() } })
      : await tx.eventRegistration.create({ data: { eventId, userId, status } });
    await signalRegistrationChange(tx, eventId, [userId]);
    return { id: registration.id, status: registration.status };
  });
}

export async function cancelRegistration(eventId: string, userId: string) {
  return withEventLock(eventId, async (tx) => {
    const registration = await tx.eventRegistration.findUnique({ where: { eventId_userId: { eventId, userId } } });
    if (!registration || registration.status === "CANCELLED") return { status: "CANCELLED" as const, promotedUserId: null };
    if (registration.status === "REJECTED") throw new AttendanceError(rejectedMessage, 409);
    if (registration.status === "CHECKED_IN") throw new AttendanceError("Uma entrada já validada não pode ser cancelada.", 409);
    // A paid ticket is cancelled by the organizer with a refund, never silently by the buyer.
    const paid = await tx.ticketOrder.findFirst({ where: { eventId, buyerId: userId, status: "PAID" }, select: { id: true } });
    if (paid) throw new AttendanceError("Ingressos pagos são cancelados pela organização com estorno. Fale com quem organiza o evento.", 409);
    await tx.eventRegistration.update({ where: { id: registration.id }, data: { status: "CANCELLED", qrVersion: { increment: 1 } } });
    let promotedUserId: string | null = null;
    if (registration.status === "CONFIRMED") {
      const event = await eventForRegistration(tx, eventId);
      // Cancellation of a published event does not revive its waiting list.
      const start = eventInstant(event.dataInicio, event.startTime, event.timezone);
      if (event.status === "PUBLISHED" && start && start.getTime() > Date.now() && !sellsTickets(event)) {
        const next = await tx.eventRegistration.findFirst({ where: { eventId, status: "WAITLISTED" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
        if (next) {
          await tx.eventRegistration.update({ where: { id: next.id }, data: { status: "CONFIRMED" } });
          await createNotification(tx, notificationCopy({ ...{ userId: next.userId, href: `/eventos/${eventId}`, title: "Sua presença foi confirmada", message: "Uma vaga abriu no evento. Sua inscrição foi confirmada." }, type: "CHECKIN" }));
          promotedUserId = next.userId;
        }
      }
    }
    await signalRegistrationChange(tx, eventId, [userId, promotedUserId]);
    return { status: "CANCELLED" as const, promotedUserId };
  });
}

const rejectedMessage = "Sua participação não foi aprovada pela organização deste evento.";
type RegistrationEvent = Awaited<ReturnType<typeof eventForRegistration>>;

/** Request to join (paid or free): waits for the organizer and takes no seat until approved. */
async function requestApproval(tx: Prisma.TransactionClient, event: RegistrationEvent, userId: string) {
  const existing = await tx.eventRegistration.findUnique({ where: { eventId_userId: { eventId: event.id, userId } } });
  if (existing?.status === "REJECTED") throw new AttendanceError(rejectedMessage, 409);
  // A free RSVP from before the paid sale holds no ticket: asking turns it into a request and revokes its QR.
  const unpaidSeat = Boolean(event.ticketsEnabled && !event.isFree && existing && ["CONFIRMED", "WAITLISTED", "CHECKED_IN"].includes(existing.status))
    && !await tx.ticketOrder.count({ where: { eventId: event.id, buyerId: userId, status: "PAID" } });
  if (unpaidSeat && existing?.status === "CHECKED_IN") throw new AttendanceError("Sua entrada neste evento já foi validada.", 409);
  if (existing && existing.status !== "CANCELLED" && !unpaidSeat) return { id: existing.id, status: existing.status };
  const registration = existing
    ? await tx.eventRegistration.update({ where: { id: existing.id }, data: { status: "PENDING", qrVersion: { increment: 1 }, checkedInAt: null, createdAt: new Date() } })
    : await tx.eventRegistration.create({ data: { eventId: event.id, userId, status: "PENDING" } });
  if (event.userId) {
    // One unread notice per event: asking, withdrawing and asking again never floods the organizer.
    await createNotificationOnce(tx, { ...notificationCopy({
      userId: event.userId, type: "SYSTEM" as const, href: `/myEvents/${encodeURIComponent(event.id)}/checkin`, groupKey: `registration-request:${event.id}`,
      title: "Novo pedido de participação", message: `${event.nome}: há pedidos para participar. Aprove ou recuse na lista de inscritos.`,
    }), groupKey: `registration-request:${event.id}` }, "unread");
  }
  await signalRegistrationChange(tx, event.id, [userId]);
  return { id: registration.id, status: registration.status };
}

/** Owner/admin only: the check-in team operates the door but does not decide who attends. */
async function assertManager(db: TeamStore, event: { id: string; userId: string | null; status: string }, actor: StaffActor): Promise<void> {
  const access = await checkInAccess(db, event, actor).catch((error: unknown) => { throw error instanceof AttendanceError && error.status === 409 ? new AttendanceError("Acesso negado.", 403) : error; });
  if (!access.canExport) throw new AttendanceError("Somente a organização do evento pode aprovar inscrições.", 403);
}

const requestStatuses: RegistrationStatus[] = ["PENDING", "APPROVED", "REJECTED"];

/** Requests waiting for a decision plus the recent decisions (approved to buy, rejected). */
export async function listRegistrationRequests(eventId: string, actor: StaffActor) {
  const event = await rosterEvent(eventId);
  await assertManager(prisma, event, actor);
  const rows = await prisma.eventRegistration.findMany({ where: { eventId, status: { in: requestStatuses } }, select: requestSelect, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 500 });
  const userIds = Array.from(new Set(rows.map((row) => row.user.id)));
  const attended = userIds.length
    ? await prisma.eventRegistration.groupBy({ by: ["userId"], where: { userId: { in: userIds }, eventId: { not: eventId }, status: "CHECKED_IN" }, _count: { _all: true } })
    : [];
  const attendedBy = new Map(attended.map((row) => [row.userId, row._count._all]));
  // Only the public profile (photo and bio) the person shows on the site; never the party-mode profile.
  return rows.map(({ user, ...row }) => ({
    ...row,
    user: { id: user.id, name: user.name, email: user.email, image: user.image ?? null, bio: user.bio ?? "" },
    attendedEvents: attendedBy.get(user.id) ?? 0,
  }));
}

export type RegistrationDecision = "APPROVE" | "REJECT";

/** Approve: free event -> confirmed (or waiting list when full); paid event -> approved to buy. Reject: final. */
export async function reviewRegistration(eventId: string, actor: StaffActor, registrationId: string, decision: RegistrationDecision) {
  return withEventLock(eventId, async (tx) => {
    const event = await eventForRegistration(tx, eventId);
    await assertManager(tx, event, actor);
    const registration = await tx.eventRegistration.findUnique({ where: { id: registrationId }, select: { id: true, eventId: true, userId: true, status: true } });
    if (!registration || registration.eventId !== eventId) throw new AttendanceError("Inscrição não encontrada neste evento.", 404);
    if (registration.status !== "PENDING") throw new AttendanceError("Este pedido já foi respondido.", 409);
    if (event.status !== "PUBLISHED") throw new AttendanceError("As inscrições deste evento estão encerradas.", 409);
    const href = `/eventos/${encodeURIComponent(eventId)}`;
    let status: RegistrationStatus;
    let notice: { title: string; message: string };
    if (decision === "REJECT") {
      status = "REJECTED";
      notice = { title: "Pedido de participação", message: `${event.nome}: sua participação não foi aprovada pela organização.` };
    } else if (event.ticketsEnabled && !event.isFree) {
      status = "APPROVED";
      notice = { title: "Participação aprovada", message: `${event.nome}: a organização aprovou sua participação. Compre seu ingresso para garantir a vaga.` };
    } else {
      const confirmed = await tx.eventRegistration.count({ where: { eventId, status: { in: ["CONFIRMED", "CHECKED_IN"] } } });
      status = event.capacity !== null && confirmed >= event.capacity ? "WAITLISTED" : "CONFIRMED";
      notice = status === "CONFIRMED"
        ? { title: "Participação aprovada", message: `${event.nome}: a organização aprovou sua participação. Sua presença está confirmada.` }
        : { title: "Participação aprovada", message: `${event.nome}: você foi aprovado e está na lista de espera; avisaremos se abrir uma vaga.` };
    }
    const changed = await tx.eventRegistration.update({ where: { id: registration.id }, data: { status }, select: { id: true, status: true } });
    await createNotification(tx, notificationCopy({ userId: registration.userId, type: (status === "REJECTED" ? "SYSTEM" : "CHECKIN") as "SYSTEM" | "CHECKIN", href, groupKey: `registration-review:${registration.id}`, ...notice }));
    const staff = await tx.user.findUnique({ where: { id: actor.id }, select: { name: true } });
    await tx.eventHistory.create({ data: { eventId: event.id, eventName: event.nome, promoterId: event.userId, actorId: actor.id, actorName: staff?.name ?? null, action: "UPDATED", note: `Inscrição ${registration.id} ${decision === "REJECT" ? "recusada" : "aprovada"}.` } });
    await signalRegistrationChange(tx, eventId, [registration.userId]);
    return changed;
  });
}

/**
 * Organizer removes a participant: the QR stops working and the person cannot sign up again. Money is never decided here:
 * a paid ticket goes through the refund, and an open Pix must finish or expire first.
 */
export async function removeAttendee(eventId: string, actor: StaffActor, registrationId: string) {
  return withEventLock(eventId, async (tx) => {
    const event = await eventForRegistration(tx, eventId);
    await assertManager(tx, event, actor);
    const registration = await tx.eventRegistration.findUnique({ where: { id: registrationId }, select: { id: true, eventId: true, userId: true, status: true } });
    if (!registration || registration.eventId !== eventId) throw new AttendanceError("Inscrição não encontrada neste evento.", 404);
    if (registration.status === "REJECTED") return { id: registration.id, status: registration.status };
    if (event.status !== "PUBLISHED") throw new AttendanceError("Só é possível remover participantes de eventos publicados.", 409);
    if (registration.status === "CHECKED_IN") throw new AttendanceError("Esta pessoa já teve a entrada validada e não pode ser removida.", 409);
    if (registration.status === "CANCELLED") throw new AttendanceError("Esta inscrição já foi cancelada.", 409);
    const paid = await tx.ticketOrder.count({ where: { eventId, buyerId: registration.userId, status: "PAID" } });
    if (paid) throw new AttendanceError("Esta pessoa tem ingresso pago. Faça o estorno em Pagamentos para removê-la do evento.", 409);
    const openPix = await tx.ticketOrder.count({ where: { eventId, buyerId: registration.userId, status: "PENDING", expiresAt: { gt: new Date() } } });
    if (openPix) throw new AttendanceError("Esta pessoa tem um Pix em aberto. Aguarde o pagamento ou a expiração para removê-la.", 409);
    const changed = await tx.eventRegistration.update({ where: { id: registration.id }, data: { status: "REJECTED", qrVersion: { increment: 1 }, checkedInAt: null }, select: { id: true, status: true } });
    const start = eventInstant(event.dataInicio, event.startTime, event.timezone);
    if (registration.status === "CONFIRMED" && !sellsTickets(event) && start && start.getTime() > Date.now()) {
      const occupied = await tx.eventRegistration.count({ where: { eventId, status: { in: ["CONFIRMED", "CHECKED_IN"] } } });
      if (event.capacity === null || occupied < event.capacity) await promoteWaiting(tx, eventId, 1);
    }
    await createNotification(tx, notificationCopy({ userId: registration.userId, type: "SYSTEM" as const, href: `/eventos/${encodeURIComponent(eventId)}`, groupKey: `registration-removed:${registration.id}`, title: "Inscrição removida", message: `${event.nome}: a organização removeu sua inscrição deste evento.` }));
    const staff = await tx.user.findUnique({ where: { id: actor.id }, select: { name: true } });
    await tx.eventHistory.create({ data: { eventId: event.id, eventName: event.nome, promoterId: event.userId, actorId: actor.id, actorName: staff?.name ?? null, action: "UPDATED", note: `Inscrição ${registration.id} removida pela organização.` } });
    await signalRegistrationChange(tx, eventId, [registration.userId]);
    return changed;
  });
}

/**
 * Organizer undoes a removal or a refusal. Free event: a seat, or the waiting list when full. Paid event: the right to
 * buy again, never a free seat. The QR version moves forward, so a code from before the removal stays invalid.
 */
export async function readmitAttendee(eventId: string, actor: StaffActor, registrationId: string) {
  return withEventLock(eventId, async (tx) => {
    const event = await eventForRegistration(tx, eventId);
    await assertManager(tx, event, actor);
    const registration = await tx.eventRegistration.findUnique({ where: { id: registrationId }, select: { id: true, eventId: true, userId: true, status: true } });
    if (!registration || registration.eventId !== eventId) throw new AttendanceError("Inscrição não encontrada neste evento.", 404);
    if (registration.status !== "REJECTED") throw new AttendanceError("Esta pessoa não está removida nem recusada.", 409);
    assertOpen(event);
    const returning = await tx.ticketOrder.count({ where: { eventId, buyerId: registration.userId, status: "PAID" } });
    if (returning) throw new AttendanceError("Há um Pix desta pessoa em devolução. Aguarde a devolução para readmiti-la.", 409);
    let status: RegistrationStatus = "APPROVED";
    if (!sellsTickets(event)) {
      const occupied = await tx.eventRegistration.count({ where: { eventId, status: { in: ["CONFIRMED", "CHECKED_IN"] } } });
      status = event.capacity !== null && occupied >= event.capacity ? "WAITLISTED" : "CONFIRMED";
    }
    const changed = await tx.eventRegistration.update({ where: { id: registration.id }, data: { status, qrVersion: { increment: 1 }, checkedInAt: null, createdAt: new Date() }, select: { id: true, status: true } });
    const message = status === "APPROVED" ? `${event.nome}: a organização readmitiu você. Compre seu ingresso para garantir a vaga.`
      : status === "WAITLISTED" ? `${event.nome}: a organização readmitiu você na lista de espera.`
      : `${event.nome}: a organização readmitiu você. Sua presença está confirmada.`;
    await createNotification(tx, notificationCopy({ userId: registration.userId, type: "CHECKIN" as const, href: `/eventos/${encodeURIComponent(eventId)}`, groupKey: `registration-readmitted:${registration.id}`, title: "Você foi readmitido", message }));
    const staff = await tx.user.findUnique({ where: { id: actor.id }, select: { name: true } });
    await tx.eventHistory.create({ data: { eventId: event.id, eventName: event.nome, promoterId: event.userId, actorId: actor.id, actorName: staff?.name ?? null, action: "UPDATED", note: `Inscrição ${registration.id} readmitida pela organização.` } });
    await signalRegistrationChange(tx, eventId, [registration.userId]);
    return changed;
  });
}

function signingSecret(): string {
  const secret = process.env.CHECKIN_SIGNING_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) throw new AttendanceError("Check-in temporariamente indisponível.", 503);
  return secret;
}

function signature(payload: string, secret = signingSecret()): string {
  return createHmac("sha256", secret).update(`eventmap-checkin-v1:${payload}`).digest("base64url");
}

type CheckInClaims = { registrationId: string; eventId: string; qrVersion: number; expiresAt: number; passId?: undefined };
type PassClaims = { passId: string; eventId: string; expiresAt: number };

export async function issueCheckInToken(eventId: string, userId: string) {
  const event = await prisma.events.findUnique({ where: { id: eventId }, select: { id: true, status: true, ticketsEnabled: true, isFree: true } });
  if (!event || (event.status !== "PUBLISHED" && event.status !== "ENDED")) throw new AttendanceError("Check-in indisponível para este evento.", 409);
  const registration = await prisma.eventRegistration.findUnique({ where: { eventId_userId: { eventId, userId } }, select: { id: true, status: true, qrVersion: true } });
  if (!registration || registration.status !== "CONFIRMED") throw new AttendanceError("Confirme sua presença para gerar o QR Code.", 403);
  await assertPaidSeat(prisma, { ...event, id: eventId }, userId);
  const claims: CheckInClaims = { registrationId: registration.id, eventId, qrVersion: registration.qrVersion, expiresAt: Date.now() + tokenLifetimeMs };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return { token: `${payload}.${signature(payload)}`, expiresAt: claims.expiresAt };
}

/** QR Code of an extra ticket (2..N) of the buyer's own paid order. */
export async function issueTicketPassToken(eventId: string, userId: string, passId: string) {
  const pass = await prisma.ticketPass.findUnique({ where: { id: passId }, select: { id: true, eventId: true, status: true, order: { select: { buyerId: true, status: true } } } });
  if (!pass || pass.eventId !== eventId || pass.order.buyerId !== userId) throw new AttendanceError("Ingresso não encontrado.", 404);
  if (pass.status === "USED") throw new AttendanceError("Este ingresso já foi utilizado na entrada.", 409);
  if (pass.status !== "VALID" || pass.order.status !== "PAID") throw new AttendanceError("Este ingresso não está mais válido.", 409);
  const claims: PassClaims = { passId: pass.id, eventId, expiresAt: Date.now() + tokenLifetimeMs };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return { token: `${payload}.${signature(payload)}`, expiresAt: claims.expiresAt };
}

function verifyCheckInToken(token: string): CheckInClaims | PassClaims {
  if (token.length > 1000) throw new AttendanceError("QR Code inválido.", 400);
  const [payload, signed, extra] = token.split(".");
  if (!payload || !signed || extra) throw new AttendanceError("QR Code inválido.", 400);
  const received = Buffer.from(signed);
  // Preserve unexpired codes issued before enabling the shared check-in key.
  const secrets = [signingSecret(), process.env.NEXTAUTH_SECRET].filter((secret): secret is string => !!secret && secret.length >= 32);
  const valid = secrets.some(secret => {
    const expected = Buffer.from(signature(payload, secret));
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
  if (!valid) throw new AttendanceError("QR Code inválido.", 400);
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!claims || typeof claims !== "object") throw new Error("invalid");
    const value = claims as Record<string, unknown>;
    if (typeof value.passId === "string") {
      if (typeof value.eventId !== "string" || typeof value.expiresAt !== "number" || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= Date.now()) throw new Error("invalid");
      return { passId: value.passId, eventId: value.eventId, expiresAt: value.expiresAt };
    }
    if (typeof value.registrationId !== "string" || typeof value.eventId !== "string" || typeof value.qrVersion !== "number" || typeof value.expiresAt !== "number" || !Number.isSafeInteger(value.qrVersion) || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= Date.now()) throw new Error("invalid");
    return { registrationId: value.registrationId, eventId: value.eventId, qrVersion: value.qrVersion, expiresAt: value.expiresAt };
  } catch {
    throw new AttendanceError("QR Code inválido ou expirado.", 400);
  }
}

type StaffActor = { id: string; role: string };
export type CheckInAccess = { role: "ADMIN" | "OWNER" | "TEAM"; canExport: boolean };
type TeamStore = Pick<Prisma.TransactionClient, "communityTeamMember">;

/** Owner and admins manage the event; CommunityTeamMember rows may only operate check-in (OPP-06). */
async function checkInAccess(db: TeamStore, event: { id: string; userId: string | null; status: string }, actor: StaffActor): Promise<CheckInAccess> {
  if (actor.role === "ADMIN") return { role: "ADMIN", canExport: true };
  if (event.userId === actor.id) return { role: "OWNER", canExport: true };
  const member = await db.communityTeamMember.findUnique({ where: { eventId_userId: { eventId: event.id, userId: actor.id } }, select: { userId: true } });
  if (!member) throw new AttendanceError("Acesso negado.", 403);
  if (event.status !== "PUBLISHED" && event.status !== "ENDED") throw new AttendanceError("Check-in indisponível para este evento.", 409);
  return { role: "TEAM", canExport: false };
}

const rosterSelect = {
  id: true, status: true, createdAt: true, checkedInAt: true,
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.EventRegistrationSelect;
const requestSelect = {
  id: true, status: true, createdAt: true, checkedInAt: true,
  user: { select: { id: true, name: true, email: true, image: true, bio: true } },
} satisfies Prisma.EventRegistrationSelect;
const rosterStatuses: RegistrationStatus[] = ["CONFIRMED", "WAITLISTED", "CHECKED_IN"];

async function rosterEvent(eventId: string) {
  const event = await prisma.events.findUnique({ where: { id: eventId }, select: { id: true, nome: true, userId: true, status: true, capacity: true, timezone: true } });
  if (!event) throw new AttendanceError("Evento não encontrado.", 404);
  return event;
}

function readRoster(eventId: string) {
  return prisma.eventRegistration.findMany({ where: { eventId, status: { in: rosterStatuses } }, select: rosterSelect, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
}

type RosterEntry = Awaited<ReturnType<typeof readRoster>>[number];

/** "maria@site.com" -> "m***@site.com": enough to tell homonyms apart at the door. */
export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return email[0] + "***" + email.slice(at);
}

/** Team members operate the door without receiving attendee e-mail addresses (LGPD minimization). */
function rosterFor(access: CheckInAccess, attendees: RosterEntry[]): RosterEntry[] {
  if (access.role !== "TEAM") return attendees;
  return attendees.map((entry) => ({ ...entry, user: { ...entry.user, email: maskEmail(entry.user.email) } }));
}

export async function getCheckInRoster(eventId: string, actor: StaffActor) {
  const event = await rosterEvent(eventId);
  const access = await checkInAccess(prisma, event, actor);
  return rosterFor(access, await readRoster(eventId));
}

export function attendanceCounts(entries: Array<{ status: RegistrationStatus | string }>) {
  let confirmed = 0, checkedIn = 0, waitlisted = 0;
  for (const entry of entries) {
    if (entry.status === "CONFIRMED") confirmed++;
    else if (entry.status === "CHECKED_IN") checkedIn++;
    else if (entry.status === "WAITLISTED") waitlisted++;
  }
  return { confirmed, checkedIn, waitlisted };
}

/** Roster plus counters and permissions for the check-in page. */
export async function getCheckInOverview(eventId: string, actor: StaffActor) {
  const event = await rosterEvent(eventId);
  const access = await checkInAccess(prisma, event, actor);
  const [roster, extraTotal, extraUsed] = await Promise.all([
    readRoster(eventId),
    prisma.ticketPass.count({ where: { eventId, status: { in: ["VALID", "USED"] } } }),
    prisma.ticketPass.count({ where: { eventId, status: "USED" } }),
  ]);
  const attendees = rosterFor(access, roster);
  return { event: { id: event.id, nome: event.nome, status: event.status, capacity: event.capacity }, access, counts: attendanceCounts(attendees), extraTickets: { total: extraTotal, checkedIn: extraUsed }, attendees };
}

/** Owner/admin only: team members operate the door but do not receive personal data exports. */
export async function getAttendeeExport(eventId: string, actor: StaffActor) {
  const event = await rosterEvent(eventId);
  const access = await checkInAccess(prisma, event, actor);
  if (!access.canExport) throw new AttendanceError("Somente a organização do evento pode exportar a lista.", 403);
  return { event: { id: event.id, nome: event.nome, timezone: event.timezone }, attendees: await readRoster(eventId) };
}

export async function checkInAttendee(eventId: string, actor: StaffActor, token: string) {
  return serializable(async (tx) => {
    const event = await eventForRegistration(tx, eventId);
    await checkInAccess(tx, { id: eventId, userId: event.userId, status: event.status }, actor);
    if (event.status !== "PUBLISHED" && event.status !== "ENDED") throw new AttendanceError("Check-in indisponível para este evento.", 409);
    const claims = verifyCheckInToken(token);
    if (claims.eventId !== eventId) throw new AttendanceError("QR Code pertence a outro evento.", 400);
    if (claims.passId !== undefined) return checkInPass(tx, eventId, claims.passId);
    const registration = await tx.eventRegistration.findUnique({ where: { id: claims.registrationId }, select: { id: true, eventId: true, userId: true, status: true, qrVersion: true, checkedInAt: true, user: { select: { id: true, name: true } } } });
    if (!registration || registration.eventId !== eventId || registration.qrVersion !== claims.qrVersion) throw new AttendanceError("QR Code inválido.", 400);
    // Idempotent (network retries never fail), but flagged so the door never shows a reused QR as a new entry.
    if (registration.status === "CHECKED_IN") return { id: registration.id, status: registration.status, checkedInAt: registration.checkedInAt, user: registration.user, alreadyCheckedIn: true as const };
    if (registration.status !== "CONFIRMED") throw new AttendanceError("Esta inscrição não está confirmada.", 409);
    await assertPaidSeat(tx, event, registration.userId);
    const changed = await tx.eventRegistration.update({ where: { id: registration.id }, data: { status: "CHECKED_IN", checkedInAt: new Date() }, select: { id: true, status: true, checkedInAt: true, user: { select: { id: true, name: true } } } });
    await signalRegistrationChange(tx, eventId, [registration.userId]);
    return { ...changed, alreadyCheckedIn: false as const };
  });
}

/** Extra ticket of a paid order: valid once, even when the same person shows several QR Codes. */
async function checkInPass(tx: Prisma.TransactionClient, eventId: string, passId: string) {
  const pass = await tx.ticketPass.findUnique({ where: { id: passId }, select: { id: true, eventId: true, position: true, status: true, checkedInAt: true, order: { select: { status: true, quantity: true, buyer: { select: { id: true, name: true } } } } } });
  if (!pass || pass.eventId !== eventId) throw new AttendanceError("QR Code inválido.", 400);
  const base = { id: pass.id, status: "CHECKED_IN" as const, user: pass.order.buyer, ticketLabel: `Ingresso ${pass.position} de ${pass.order.quantity}` };
  if (pass.status === "USED") return { ...base, checkedInAt: pass.checkedInAt, alreadyCheckedIn: true as const };
  if (pass.status !== "VALID" || pass.order.status !== "PAID") throw new AttendanceError("Este ingresso não está mais válido.", 409);
  const checkedInAt = new Date();
  await tx.ticketPass.update({ where: { id: pass.id }, data: { status: "USED", checkedInAt } });
  await signalRegistrationChange(tx, eventId, [pass.order.buyer.id]);
  return { ...base, checkedInAt, alreadyCheckedIn: false as const };
}

/** Door check-in for attendees without a phone: same rules as the QR flow, audited in EventHistory. */
export async function manualCheckIn(eventId: string, actor: StaffActor, registrationId: string) {
  return serializable(async (tx) => {
    const event = await tx.events.findUnique({ where: { id: eventId }, select: { id: true, nome: true, userId: true, status: true, ticketsEnabled: true, isFree: true } });
    if (!event) throw new AttendanceError("Evento não encontrado.", 404);
    await checkInAccess(tx, event, actor);
    if (event.status !== "PUBLISHED" && event.status !== "ENDED") throw new AttendanceError("Check-in indisponível para este evento.", 409);
    const registration = await tx.eventRegistration.findUnique({ where: { id: registrationId }, select: { id: true, eventId: true, userId: true, status: true, checkedInAt: true, user: { select: { id: true, name: true } } } });
    if (!registration || registration.eventId !== eventId) throw new AttendanceError("Inscrição não encontrada neste evento.", 404);
    if (registration.status === "CHECKED_IN") return { id: registration.id, status: registration.status, checkedInAt: registration.checkedInAt, user: registration.user };
    if (registration.status !== "CONFIRMED") throw new AttendanceError("Esta inscrição não está confirmada.", 409);
    await assertPaidSeat(tx, event, registration.userId);
    const changed = await tx.eventRegistration.update({ where: { id: registration.id }, data: { status: "CHECKED_IN", checkedInAt: new Date() }, select: { id: true, status: true, checkedInAt: true, user: { select: { id: true, name: true } } } });
    const staff = await tx.user.findUnique({ where: { id: actor.id }, select: { name: true } });
    // Audit without copying attendee personal data into the event history.
    await tx.eventHistory.create({ data: { eventId: event.id, eventName: event.nome, promoterId: event.userId, actorId: actor.id, actorName: staff?.name ?? null, action: "UPDATED", note: "Check-in manual da inscrição " + registration.id + "." } });
    await signalRegistrationChange(tx, eventId, [registration.userId]);
    return changed;
  });
}
