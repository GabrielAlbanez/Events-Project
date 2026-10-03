"use server";
import prisma from "@/lib/prisma";
import { publicEventSelect } from "@/lib/eventQueries";
export default async function getAllEvents() {
  return prisma.events.findMany({
    where: { status: "PUBLISHED" }, select: publicEventSelect,
    orderBy: { dataInicio: "asc" },
  });
}
