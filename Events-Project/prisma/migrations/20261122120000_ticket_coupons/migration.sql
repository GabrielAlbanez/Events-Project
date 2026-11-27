-- Additive: discount coupons for ticket sales. New table plus two columns on ticket_orders with safe defaults
-- (couponId NULL, discountCents 0). No existing row or column is modified or removed.
-- AlterTable
ALTER TABLE "ticket_orders" ADD COLUMN     "couponId" TEXT,
ADD COLUMN     "discountCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ticket_coupons" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "percentOff" INTEGER,
    "amountOffCents" INTEGER,
    "maxUses" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_coupons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_coupons_eventId_code_key" ON "ticket_coupons"("eventId", "code");

-- AddForeignKey
ALTER TABLE "ticket_coupons" ADD CONSTRAINT "ticket_coupons_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "ticket_coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
