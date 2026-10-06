import prisma from "@/lib/prisma";
import { randomUUID } from "node:crypto";
import { notifyEventAudience } from "@/lib/eventNotifications";
import { planOccurrences, recurrenceInputSchema, type RecurrenceInput } from "@/lib/recurrence";
import type { ResolveCurrentUser } from "@/lib/services/authContext";

export async function criarSerieRecorrente(sourceEventId: string, input: RecurrenceInput, resolveCurrentUser: ResolveCurrentUser) {
  const user = await resolveCurrentUser();
  if (!user || !["ADMIN", "PROMOTER"].includes(user.role))
    return { success: false as const, message: "Acesso negado." };

  const parsed = recurrenceInputSchema.safeParse(input);
  if (!parsed.success)
    return { success: false as const, message: "Escolha uma frequência, intervalo e quantidade válidos." };

  try {
    return await prisma.$transaction(async (transaction) => {
      const source = await transaction.events.findFirst({
        where: { id: sourceEventId, ...(user.role === "ADMIN" ? {} : { userId: user.id }) },
      });
      if (!source) return { success: false as const, message: "Evento não encontrado." };
      if (source.recurrenceSeriesId) return { success: false as const, message: "Este evento já pertence a uma série." };
      if (!["DRAFT", "PENDING", "CHANGES_REQUESTED"].includes(source.status))
        return { success: false as const, message: "Crie a repetição antes da publicação do evento." };

      const dates = planOccurrences(source.dataInicio, source.dataFim, parsed.data);
      const series = await transaction.eventSeries.create({
        data: {
          ownerId: source.userId ?? user.id,
          frequency: parsed.data.frequency,
          interval: parsed.data.interval,
          count: parsed.data.count,
          timezone: source.timezone,
        },
      });
      const changed = await transaction.events.updateMany({
        where: { id: source.id, recurrenceSeriesId: null, status: source.status, updatedAt: source.updatedAt },
        data: { recurrenceSeriesId: series.id, recurrenceIndex: 0 },
      });
      if (!changed.count) throw new Error("CONCURRENT_EVENT_CHANGE");

      const actor = await transaction.user.findUnique({ where: { id: user.id }, select: { name: true } });
      const copies = dates.slice(1).map((occurrence, offset) => ({
            id: randomUUID(),
            nome: source.nome,
            descricao: source.descricao,
            endereco: source.endereco,
            banner: source.banner,
            carrossel: source.carrossel,
            linkParaCompra: source.linkParaCompra,
            dataInicio: occurrence.dataInicio,
            dataFim: occurrence.dataFim,
            category: source.category,
            isFree: source.isFree,
            priceCents: source.priceCents,
            capacity: source.capacity,
            lat: source.lat,
            lng: source.lng,
            startTime: source.startTime,
            endTime: source.endTime,
            timezone: source.timezone,
            userId: source.userId ?? user.id,
            status: source.status === "PENDING" ? "PENDING" as const : "DRAFT" as const,
            validate: false,
            recurrenceSeriesId: series.id,
            recurrenceIndex: offset + 1,
      }));
      await transaction.events.createMany({ data: copies });
      await transaction.eventHistory.createMany({ data: copies.map(event => ({
            eventId: event.id,
            eventName: event.nome,
            promoterId: event.userId,
            actorId: user.id,
            actorName: actor?.name,
            action: "CREATED",
            note: "Ocorrência de série recorrente.",
      })) });
      if (copies[0]?.status === "PENDING")
          await notifyEventAudience(transaction, copies[0], {
            title: "Série em revisão",
            message: `${dates.length} datas de ${source.nome} foram enviadas para análise.`,
            includeAdmins: true,
          });
      const eventIds = [source.id, ...copies.map(event => event.id)];
      return { success: true as const, message: `${eventIds.length} datas criadas.`, eventIds };
    }, { maxWait: 10_000, timeout: 30_000 });
  } catch (error) {
    if (error instanceof Error && error.message === "CONCURRENT_EVENT_CHANGE")
      return { success: false as const, message: "O evento foi alterado durante a criação da série. Atualize a página e tente novamente." };
    if (error instanceof Error && (error.message === "Datas do evento inválidas." || error.message === "Limite a série a um ano."))
      return { success: false as const, message: error.message };
    return { success: false as const, message: "Não foi possível criar a série recorrente." };
  }
}
