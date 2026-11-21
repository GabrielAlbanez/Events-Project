-- Additive: Pix ticket sales with Mercado Pago marketplace split. No existing row or column is modified or removed;
-- events gains two columns with safe defaults (ticketsEnabled = false, ticketCapacity = NULL).
-- CreateEnum
CREATE TYPE "TicketOrderStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'REFUNDED');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "ticketCapacity" INTEGER,
ADD COLUMN     "ticketsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "mercado_pago_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mpUserId" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mercado_pago_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_orders" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "unitCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL,
    "status" "TicketOrderStatus" NOT NULL DEFAULT 'PENDING',
    "mpPaymentId" TEXT,
    "pixCopyPaste" TEXT,
    "pixQrBase64" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mercado_pago_accounts_userId_key" ON "mercado_pago_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_orders_mpPaymentId_key" ON "ticket_orders"("mpPaymentId");

-- CreateIndex
CREATE INDEX "ticket_orders_eventId_status_idx" ON "ticket_orders"("eventId", "status");

-- CreateIndex
CREATE INDEX "ticket_orders_buyerId_createdAt_idx" ON "ticket_orders"("buyerId", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_orders_sellerId_status_idx" ON "ticket_orders"("sellerId", "status");

-- AddForeignKey
ALTER TABLE "mercado_pago_accounts" ADD CONSTRAINT "mercado_pago_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

