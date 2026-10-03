import { Prisma } from "@prisma/client";
import { CommunityAction } from "@/schemas/community";
import { CommunityQueueState } from "@/types/community";
import { CommunityError } from "./common";
import { CommunityEntries } from "./entries";
import { textValue } from "./json";
import { notifyCommunityUser } from "./notifications";

export function queueState(value: Prisma.JsonValue | undefined): CommunityQueueState {
  return value === "PAUSED" || value === "CLOSED" ? value : "OPEN";
}
export async function handleQueue(action: CommunityAction, tx: Prisma.TransactionClient, entries: CommunityEntries, eventId: string, userId: string, permissions: { manage: boolean; team: boolean }): Promise<boolean> {
  switch (action.action) {
    case "queue.create":
      if (!permissions.manage) throw new CommunityError(403, "Sem permissão para criar filas.");
      await entries.create("queue", { title: action.title, state: "OPEN" });
      break;
    case "queue.control":
      if (!permissions.team) throw new CommunityError(403, "Sem permissão para controlar esta fila.");
      await entries.update(action.id, "queue", { state: action.state });
      break;
    case "queue.join": {
      const queue = await entries.find(action.id, "queue");
      if (queueState(queue.data.state) !== "OPEN") throw new CommunityError(409, "Esta fila não está recebendo participantes.");
      const current = await tx.communityQueueTicket.findUnique({ where: { entryId_userId: { entryId: action.id, userId } } });
      if (current && ["WAITING", "CALLED"].includes(current.status)) throw new CommunityError(409, "Você já está nesta fila.");
      if (await tx.communityQueueTicket.count({ where: { entryId: action.id, status: "WAITING" } }) >= 500) throw new CommunityError(409, "Fila cheia.");
      await tx.communityQueueTicket.upsert({ where: { entryId_userId: { entryId: action.id, userId } }, create: { entryId: action.id, userId }, update: { status: "WAITING", createdAt: new Date() } });
      break;
    }
    case "queue.leave":
      await entries.find(action.id, "queue");
      await tx.communityQueueTicket.updateMany({ where: { entryId: action.id, userId, status: { in: ["WAITING", "CALLED"] } }, data: { status: "LEFT" } });
      break;
    case "queue.next": {
      if (!permissions.team) throw new CommunityError(403, "Sem permissão para chamar participantes.");
      const queue = await entries.find(action.id, "queue");
      if (queueState(queue.data.state) === "CLOSED") throw new CommunityError(409, "Esta fila está encerrada.");
      await tx.communityQueueTicket.updateMany({ where: { entryId: action.id, status: "CALLED" }, data: { status: "DONE" } });
      const next = await tx.communityQueueTicket.findFirst({ where: { entryId: action.id, status: "WAITING" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      if (next) {
        await tx.communityQueueTicket.update({ where: { id: next.id }, data: { status: "CALLED" } });
        await notifyCommunityUser(tx, eventId, next.userId, "Chegou sua vez", `Sua vez na fila ${textValue(queue.data.title)}.`);
      }
      break;
    }
    default: return false;
  }
  return true;
}
