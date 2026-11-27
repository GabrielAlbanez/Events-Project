-- Automatic event triage. Additive only: new nullable columns and a new table.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "organizerTrustResetAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "events" ADD COLUMN "bannerHash" TEXT;

-- CreateTable
CREATE TABLE "event_moderations" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "trust" TEXT NOT NULL,
    "reasons" JSONB NOT NULL,
    "aiUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_moderations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_bannerHash_idx" ON "events"("bannerHash");

-- CreateIndex
CREATE INDEX "event_moderations_eventId_createdAt_idx" ON "event_moderations"("eventId", "createdAt");

-- AddForeignKey
ALTER TABLE "event_moderations" ADD CONSTRAINT "event_moderations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
