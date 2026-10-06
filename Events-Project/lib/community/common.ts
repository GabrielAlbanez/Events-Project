import { Prisma, Role } from "@prisma/client";
import prisma from "@/lib/prisma";

export type Actor = { id: string; role: Role };
export class CommunityError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function transact<T>(work: (tx: Prisma.TransactionClient) => Promise<T>, options?: { timeout: number; maxWait: number }): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, ...options }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code) && attempt < 3) continue;
      throw error;
    }
  }
}
export async function signal(tx: Prisma.TransactionClient, room: string): Promise<void> {
  await tx.communitySignal.create({ data: { room } });
}
