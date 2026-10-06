"use server";

import { EventHistoryAction } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/adminAuth";

type HistoryEntry = {
  id: string;
  eventId: string;
  eventName: string;
  promoterId: string | null;
  actorId: string;
  actorName: string | null;
  action: EventHistoryAction;
  note: string | null;
  createdAt: string;
};

function serializeHistory(entry: {
  id: string;
  eventId: string;
  eventName: string;
  promoterId: string | null;
  actorId: string;
  actorName: string | null;
  action: EventHistoryAction;
  note: string | null;
  createdAt: Date;
}): HistoryEntry {
  return { ...entry, createdAt: entry.createdAt.toISOString() };
}

export async function getRecentEventHistory() {
  const user = await getAuthenticatedUser();
  if (!user) return { status: "error" as const, message: "Acesso negado." };

  try {
    const entries = await prisma.eventHistory.findMany({
      where: user.role === "ADMIN" ? {} : { promoterId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
    });
    return { status: "success" as const, history: entries.map(serializeHistory) };
  } catch {
    return { status: "error" as const, message: "Erro ao buscar histórico de eventos." };
  }
}

export async function getEventHistory(eventId: string) {
  const user = await getAuthenticatedUser();
  if (!user || !eventId) return { status: "error" as const, message: "Acesso negado." };

  try {
    if (user.role !== "ADMIN") {
      const owned = await prisma.eventHistory.findFirst({
        where: { eventId, promoterId: user.id },
        select: { id: true },
      });
      const event = owned ? null : await prisma.events.findFirst({ where: { id: eventId, userId: user.id }, select: { id: true } });
      if (!owned && !event) return { status: "error" as const, message: "Acesso negado." };
    }

    const entries = await prisma.eventHistory.findMany({
      where: { eventId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
    });
    return { status: "success" as const, history: entries.map(serializeHistory) };
  } catch {
    return { status: "error" as const, message: "Erro ao buscar histórico de eventos." };
  }
}
