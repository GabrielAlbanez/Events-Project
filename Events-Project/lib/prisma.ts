import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const productionDatabaseUrl = process.env.VERCEL_ENV === "production"
  ? process.env.EVENTMAP_PRODUCTION_DATABASE_URL
  : undefined;

const prisma = globalForPrisma.prisma || new PrismaClient(
  productionDatabaseUrl ? { datasourceUrl: productionDatabaseUrl } : undefined,
);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
