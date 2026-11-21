import { createNotification } from "@/lib/notifications/create";
import { notificationCopy } from "@/lib/notifications/catalog";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma, RegistrationStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { eventInstant } from "@/lib/eventTime";
import { ticketPaymentsConfigured } from "@/lib/ticketSecurity";

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
    id: true, status: true, dataInicio: true, startTime: true, timezone: true,
    capacity: true, userId: true, ticketsEnabled: true, isFree: true,
  } });
  if (!event) throw new AttendanceError("Evento não encontrado.", 404);
  return event;
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
  }
  return next.length;
}

/** Call after publishing an event whose capacity increased; safe to repeat. */
export async function reconcileEventWaitlist(eventId: string): Promise<number> {
  return serializable(async (tx) => {
    const event = await eventForRegistration(tx, eventId);
    const start = eventInstant(event.dataInicio, event.startTime, event.timezone);
    if (event.status !== "PUBLISHED" || !start || start.getTime() <= Date.now()) return 0;
    const occupied = await tx.eventRegistration.count({ where: { eventId, status: { in: ["CONFIRMED", "CHECKED_IN"] } } });
    const waiting = await tx.eventRegistration.count({ where: { eventId, status: "WAITLISTED" } });
    const freePlaces = event.capacity === null ? waiting : Math.max(0, event.capacity - occupied);
    return promoteWaiting(tx, eventId, Math.min(waiting, freePlaces));
  });
}

export async function getRegistrationState(eventId: string, userId: string | null) {
  const event = await prisma.events.findUnique({ where: { id: eventId }, select: {
    id: true, status: true, capacity: true, ticketsEnabled: true, isFree: true,
  } });
  if (!event) throw new AttendanceError("Evento não encontrado.", 404);
  const [confirmedCount, waitingCount, registration] = await Promise.all([
    prisma.eventRegistration.count({ where: { eventId, status: { in: ["CONFIRMED", "CHECKED_IN"] } } }),
    prisma.eventRegistration.count({ where: { eventId, status: "WAITLISTED" } }),
    userId ? prisma.eventRegistration.findUnique({ where: { eventId_userId: { eventId, userId } }, select: { id: true, status: true, createdAt: true, checkedInAt: true } }) : Promise.resolve(null),
  ]);
  const sellsTickets = Boolean(event.ticketsEnabled && !event.isFree);
  const configured = ticketPaymentsConfigured();
  // ticketSalesPaused: EventMap sells this event, but payments are not configured right now (no free RSVP either).
  return { capacity: event.capacity, confirmedCount, waitingCount, registration, ticketSale: Boolean(event.ticketsEnabled && !event.isFree && ticketPaymentsConfigured()), ticketSalesPaused: sellsTickets && !configured };
}

export async function registerForEvent(eventId: string, userId: string) {
  return serializable(async (tx) => {
    const event = await eventForRegistration(tx, eventId);
    assertOpen(event);
    if (event.userId === userId) throw new AttendanceError("O organizador não pode se inscrever no próprio evento.", 409);
    // While EventMap sells the tickets, the registration (and its QR) comes only from a paid order.
    // Also while payments are not configured: a paid event never turns into a free RSVP.
    if (event.ticketsEnabled && !event.isFree) {
      throw new AttendanceError(ticketPaymentsConfigured() ? "Este evento vende ingressos pelo EventMap. Compre seu ingresso para participar." : "As vendas deste evento estão pausadas no momento.", 409);
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
    return { id: registration.id, status: registration.status };
  });
}

export async function cancelRegistration(eventId: string, userId: string) {
  return serializable(async (tx) => {
    const registration = await tx.eventRegistration.findUnique({ where: { eventId_userId: { eventId, userId } } });
    if (!registration || registration.status === "CANCELLED") return { status: "CANCELLED" as const, promotedUserId: null };
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
      if (event.status === "PUBLISHED" && start && start.getTime() > Date.now()) {
        const next = await tx.eventRegistration.findFirst({ where: { eventId, status: "WAITLISTED" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
        if (next) {
          await tx.eventRegistration.update({ where: { id: next.id }, data: { status: "CONFIRMED" } });
          await createNotification(tx, notificationCopy({ ...{ userId: next.userId, href: `/eventos/${eventId}`, title: "Sua presença foi confirmada", message: "Uma vaga abriu no evento. Sua inscrição foi confirmada." }, type: "CHECKIN" }));
          promotedUserId = next.userId;
        }
      }
    }
    return { status: "CANCELLED" as const, promotedUserId };
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

type CheckInClaims = { registrationId: string; eventId: string; qrVersion: number; expiresAt: number };

export async function issueCheckInToken(eventId: string, userId: string) {
  const event = await prisma.events.findUnique({ where: { id: eventId }, select: { status: true } });
  if (!event || (event.status !== "PUBLISHED" && event.status !== "ENDED")) throw new AttendanceError("Check-in indisponível para este evento.", 409);
  const registration = await prisma.eventRegistration.findUnique({ where: { eventId_userId: { eventId, userId } }, select: { id: true, status: true, qrVersion: true } });
  if (!registration || registration.status !== "CONFIRMED") throw new AttendanceError("Confirme sua presença para gerar o QR Code.", 403);
  const claims: CheckInClaims = { registrationId: registration.id, eventId, qrVersion: registration.qrVersion, expiresAt: Date.now() + tokenLifetimeMs };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return { token: `${payload}.${signature(payload)}`, expiresAt: claims.expiresAt };
}

function verifyCheckInToken(token: string): CheckInClaims {
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
  const attendees = rosterFor(access, await readRoster(eventId));
  return { event: { id: event.id, nome: event.nome, status: event.status, capacity: event.capacity }, access, counts: attendanceCounts(attendees), attendees };
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
    const registration = await tx.eventRegistration.findUnique({ where: { id: claims.registrationId }, select: { id: true, eventId: true, status: true, qrVersion: true, checkedInAt: true, user: { select: { id: true, name: true } } } });
    if (!registration || registration.eventId !== eventId || registration.qrVersion !== claims.qrVersion) throw new AttendanceError("QR Code inválido.", 400);
    if (registration.status === "CHECKED_IN") return { id: registration.id, status: registration.status, checkedInAt: registration.checkedInAt, user: registration.user };
    if (registration.status !== "CONFIRMED") throw new AttendanceError("Esta inscrição não está confirmada.", 409);
    const changed = await tx.eventRegistration.update({ where: { id: registration.id }, data: { status: "CHECKED_IN", checkedInAt: new Date() }, select: { id: true, status: true, checkedInAt: true, user: { select: { id: true, name: true } } } });
    return changed;
  });
}

/** Door check-in for attendees without a phone: same rules as the QR flow, audited in EventHistory. */
export async function manualCheckIn(eventId: string, actor: StaffActor, registrationId: string) {
  return serializable(async (tx) => {
    const event = await tx.events.findUnique({ where: { id: eventId }, select: { id: true, nome: true, userId: true, status: true } });
    if (!event) throw new AttendanceError("Evento não encontrado.", 404);
    await checkInAccess(tx, event, actor);
    if (event.status !== "PUBLISHED" && event.status !== "ENDED") throw new AttendanceError("Check-in indisponível para este evento.", 409);
    const registration = await tx.eventRegistration.findUnique({ where: { id: registrationId }, select: { id: true, eventId: true, status: true, checkedInAt: true, user: { select: { id: true, name: true } } } });
    if (!registration || registration.eventId !== eventId) throw new AttendanceError("Inscrição não encontrada neste evento.", 404);
    if (registration.status === "CHECKED_IN") return { id: registration.id, status: registration.status, checkedInAt: registration.checkedInAt, user: registration.user };
    if (registration.status !== "CONFIRMED") throw new AttendanceError("Esta inscrição não está confirmada.", 409);
    const changed = await tx.eventRegistration.update({ where: { id: registration.id }, data: { status: "CHECKED_IN", checkedInAt: new Date() }, select: { id: true, status: true, checkedInAt: true, user: { select: { id: true, name: true } } } });
    const staff = await tx.user.findUnique({ where: { id: actor.id }, select: { name: true } });
    // Audit without copying attendee personal data into the event history.
    await tx.eventHistory.create({ data: { eventId: event.id, eventName: event.nome, promoterId: event.userId, actorId: actor.id, actorName: staff?.name ?? null, action: "UPDATED", note: "Check-in manual da inscrição " + registration.id + "." } });
    return changed;
  });
}
