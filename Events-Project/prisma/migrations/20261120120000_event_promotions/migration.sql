-- Additive: paid event highlights (Pix manual + admin review). No existing table or row is modified.
-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('PENDING_PAYMENT', 'AWAITING_REVIEW', 'ACTIVE', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "event_promotions" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "PromotionStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "payerNote" TEXT,
    "reviewNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_promotions_eventId_status_idx" ON "event_promotions"("eventId", "status");

-- CreateIndex
CREATE INDEX "event_promotions_status_endsAt_idx" ON "event_promotions"("status", "endsAt");

-- AddForeignKey
ALTER TABLE "event_promotions" ADD CONSTRAINT "event_promotions_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_promotions" ADD CONSTRAINT "event_promotions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_promotions" ADD CONSTRAINT "event_promotions_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

