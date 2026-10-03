import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma, RegistrationStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { eventInstant } from "@/lib/eventTime";

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
    capacity: true, userId: true,
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
    await tx.notification.create({ data: {
      userId: registration.userId,
      href: `/eventos/${eventId}`,
      title: "Sua presença foi confirmada",
      message: "Uma vaga abriu no evento. Sua inscrição foi confirmada.",
    } });
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
    id: true, status: true, capacity: true,
  } });
  if (!event) throw new AttendanceError("Evento não encontrado.", 404);
  const [confirmedCount, waitingCount, registration] = await Promise.all([
    prisma.eventRegistration.count({ where: { eventId, status: { in: ["CONFIRMED", "CHECKED_IN"] } } }),
    prisma.eventRegistration.count({ where: { eventId, status: "WAITLISTED" } }),
    userId ? prisma.eventRegistration.findUnique({ where: { eventId_userId: { eventId, userId } }, select: { id: true, status: true, createdAt: true, checkedInAt: true } }) : Promise.resolve(null),
  ]);
  return { capacity: event.capacity, confirmedCount, waitingCount, registration };
}

export async function registerForEvent(eventId: string, userId: string) {
  return serializable(async (tx) => {
    const event = await eventForRegistration(tx, eventId);
    assertOpen(event);
    if (event.userId === userId) throw new AttendanceError("O organizador não pode se inscrever no próprio evento.", 409);
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
          await tx.notification.create({ data: { userId: next.userId, href: `/eventos/${eventId}`, title: "Sua presença foi confirmada", message: "Uma vaga abriu no evento. Sua inscrição foi confirmada." } });
          promotedUserId = next.userId;
        }
      }
    }
    return { status: "CANCELLED" as const, promotedUserId };
  });
}

function signingSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) throw new AttendanceError("Check-in temporariamente indisponível.", 503);
  return secret;
}

function signature(payload: string): string {
  return createHmac("sha256", signingSecret()).update(`eventmap-checkin-v1:${payload}`).digest("base64url");
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
  const expected = Buffer.from(signature(payload));
  const received = Buffer.from(signed);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new AttendanceError("QR Code inválido.", 400);
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

export async function getCheckInRoster(eventId: string, actor: { id: string; role: string }) {
  const event = await prisma.events.findUnique({ where: { id: eventId }, select: { userId: true } });
  if (!event) throw new AttendanceError("Evento não encontrado.", 404);
  if (actor.role !== "ADMIN" && event.userId !== actor.id) throw new AttendanceError("Acesso negado.", 403);
  return prisma.eventRegistration.findMany({ where: { eventId, status: { in: ["CONFIRMED", "WAITLISTED", "CHECKED_IN"] } }, select: {
    id: true, status: true, createdAt: true, checkedInAt: true,
    user: { select: { id: true, name: true, email: true } },
  }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
}

export async function checkInAttendee(eventId: string, actor: { id: string; role: string }, token: string) {
  return serializable(async (tx) => {
    const event = await eventForRegistration(tx, eventId);
    if (actor.role !== "ADMIN" && event.userId !== actor.id) throw new AttendanceError("Acesso negado.", 403);
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
