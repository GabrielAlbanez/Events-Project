import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { eventInstant } from "@/lib/eventTime";
import type { ActivitySnapshot } from "@/types/activity";
import { Actor, CommunityError } from "./common";
import { entryData, textValue } from "./json";
import { queueState } from "./queues";

const LIMIT = 20;
const eventSelect = { id: true, nome: true } satisfies Prisma.EventsSelect;

/** A bounded, account-specific read model; never carries another participant's identity. */
export async function activitySnapshot(actor: Actor): Promise<ActivitySnapshot> {
  return prisma.$transaction(async tx => {
    const current = await tx.user.findUnique({ where: { id: actor.id }, select: { id: true, role: true } });
    if (!current) throw new CommunityError(401, "Entre novamente na sua conta.");
    const staff: Prisma.EventsWhereInput = current.role === "ADMIN" ? {} : { OR: [{ userId: current.id }, { communityTeam: { some: { userId: current.id } } }] };
    const visible: Prisma.EventsWhereInput = { OR: [{ status: { in: ["PUBLISHED", "ENDED"] } }, staff] };
    const now = new Date();
    const [tickets, entries, registrations, rooms] = await Promise.all([
      tx.communityQueueTicket.findMany({ where: { userId: current.id, status: { in: ["WAITING", "CALLED"] }, entry: { kind: "queue", event: visible } }, select: { id: true, entryId: true, status: true, createdAt: true, entry: { select: { data: true, event: { select: eventSelect } } } }, orderBy: [{ status: "asc" }, { createdAt: "asc" }, { id: "asc" }], take: LIMIT + 1 }),
      tx.communityEntry.findMany({ where: { kind: "task", event: staff, AND: [{ data: { path: ["assignedTo"], equals: current.id } }, { OR: [{ data: { path: ["status"], equals: "TODO" } }, { data: { path: ["status"], equals: "HELP" } }] }] }, select: { id: true, data: true, event: { select: eventSelect } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: LIMIT + 1 }),
      tx.eventRegistration.findMany({ where: { userId: current.id, status: { in: ["CONFIRMED", "CHECKED_IN"] }, event: { status: "PUBLISHED", dataFim: { gte: new Date(now.getTime() - 86400000).toISOString().slice(0, 10) } } }, select: { id: true, status: true, event: { select: { ...eventSelect, banner: true, dataInicio: true, dataFim: true, startTime: true, endTime: true, timezone: true } } }, orderBy: [{ event: { dataInicio: "asc" } }, { id: "asc" }], take: LIMIT + 2 }),
      tx.friendsRoom.findMany({ where: { members: { some: { userId: current.id } } }, select: { id: true, name: true, _count: { select: { members: true, suggestions: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: LIMIT + 1 }),
    ]);
    const queues: ActivitySnapshot["queues"] = await Promise.all(tickets.slice(0, LIMIT).map(async ticket => {
      const data = entryData(ticket.entry.data);
      const position = ticket.status === "WAITING" ? 1 + await tx.communityQueueTicket.count({ where: { entryId: ticket.entryId, status: "WAITING", OR: [{ createdAt: { lt: ticket.createdAt } }, { createdAt: ticket.createdAt, id: { lt: ticket.id } }] } }) : 0;
      return { id: ticket.entryId, eventId: ticket.entry.event.id, eventName: ticket.entry.event.nome, title: textValue(data.title), state: queueState(data.state), status: ticket.status === "CALLED" ? "CALLED" : "WAITING", position };
    }));
    const tasks: ActivitySnapshot["tasks"] = entries.slice(0, LIMIT).map(entry => { const data = entryData(entry.data); return { id: entry.id, eventId: entry.event.id, eventName: entry.event.nome, title: textValue(data.title), status: data.status === "HELP" ? "HELP" : "TODO" }; });
    const upcoming: ActivitySnapshot["registrations"] = registrations.flatMap(registration => {
      const event = registration.event;
      const start = eventInstant(event.dataInicio, event.startTime, event.timezone);
      const end = eventInstant(event.dataFim, event.endTime, event.timezone, "23:59");
      return start && end && end >= now ? [{ id: registration.id, eventId: event.id, eventName: event.nome, banner: event.banner, startsAt: start.toISOString(), endsAt: end.toISOString(), status: registration.status === "CHECKED_IN" ? "CHECKED_IN" as const : "CONFIRMED" as const }] : [];
    });
    return { generatedAt: now.toISOString(), queues, tasks, registrations: upcoming.slice(0, LIMIT), rooms: rooms.slice(0, LIMIT).map(room => ({ id: room.id, name: room.name, members: room._count.members, suggestions: room._count.suggestions })), counts: { queues: queues.length, called: queues.filter(queue => queue.status === "CALLED" && queue.state !== "CLOSED").length, tasks: tasks.length, registrations: Math.min(upcoming.length, LIMIT), rooms: Math.min(rooms.length, LIMIT) }, truncated: { queues: tickets.length > LIMIT, tasks: entries.length > LIMIT, registrations: upcoming.length > LIMIT || registrations.length === LIMIT + 2, rooms: rooms.length > LIMIT } };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
}
