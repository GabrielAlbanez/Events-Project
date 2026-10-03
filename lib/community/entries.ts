import { Prisma } from "@prisma/client";
import { CommunityError } from "./common";
import { entryData } from "./json";

export function communityEntries(tx: Prisma.TransactionClient, eventId: string, authorId: string) {
  async function find(id: string, kind: string) {
    const entry = await tx.communityEntry.findFirst({ where: { id, eventId, kind } });
    if (!entry) throw new CommunityError(404, "Item não encontrado.");
    return { ...entry, data: entryData(entry.data) };
  }
  async function create(kind: string, fields: Prisma.InputJsonObject) {
    if (await tx.communityEntry.count({ where: { eventId, kind } }) >= 100) throw new CommunityError(409, "Limite de 100 itens por categoria atingido.");
    await tx.communityEntry.create({ data: { eventId, authorId, kind, data: fields } });
  }
  async function update(id: string, kind: string, fields: Prisma.InputJsonObject) {
    const current = await find(id, kind);
    await tx.communityEntry.update({ where: { id }, data: { data: { ...current.data, ...fields } as Prisma.InputJsonObject } });
  }
  return { find, create, update };
}
export type CommunityEntries = ReturnType<typeof communityEntries>;
