import { Prisma } from "@prisma/client";
import { Evento } from "@/types";
import prisma from "@/lib/prisma";

// Every nested account field is explicitly public.
export const publicEventSelect = {
  id: true, nome: true, banner: true, carrossel: true, descricao: true,
  dataInicio: true, dataFim: true, linkParaCompra: true, endereco: true,
  userId: true, validate: true, status: true, category: true, priceCents: true,
  isFree: true, lat: true, lng: true, startTime: true, endTime: true, timezone: true,
  validatedAt: true,
  user: { select: { id: true, name: true, image: true } },
  validator: { select: { id: true, name: true, image: true } },
} satisfies Prisma.EventsSelect;

export async function getPublicEvent(id: string): Promise<Evento | null> {
  const event = await prisma.events.findFirst({
    where: { id, status: { in: ["PUBLISHED", "CANCELLED", "ENDED"] } },
    select: publicEventSelect,
  });
  return event ? { ...event, validate: event.validate ?? false } : null;
}
