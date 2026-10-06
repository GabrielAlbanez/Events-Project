import prisma from "@/lib/prisma";

export async function getAllDataEvents() {
  return await prisma.events.findMany();
}
