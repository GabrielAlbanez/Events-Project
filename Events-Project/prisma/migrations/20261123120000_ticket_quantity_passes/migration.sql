-- CreateEnum
CREATE TYPE "TicketPassStatus" AS ENUM ('VALID', 'USED', 'CANCELLED');

-- AlterTable
ALTER TABLE "ticket_orders" ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ticket_passes" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "TicketPassStatus" NOT NULL DEFAULT 'VALID',
    "checkedInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_passes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_passes_eventId_status_idx" ON "ticket_passes"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_passes_orderId_position_key" ON "ticket_passes"("orderId", "position");

-- AddForeignKey
ALTER TABLE "ticket_passes" ADD CONSTRAINT "ticket_passes_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ticket_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_passes" ADD CONSTRAINT "ticket_passes_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

