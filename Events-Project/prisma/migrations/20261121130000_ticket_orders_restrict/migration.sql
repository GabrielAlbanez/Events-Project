-- Constraint-only: ticket orders are financial records, so deleting their event or the buyer/seller account must fail
-- instead of cascading. No row or column changes. The three foreign keys are recreated with ON DELETE RESTRICT inside one
-- transaction, so there is no moment without referential integrity. ticket_orders is small, and existing rows already
-- satisfy the keys, so the validation scan and the brief locks on "events"/"User" are short.
-- Manual revert (only if ever needed): docs/superpowers/specs/2026-11-21-ingressos-rollback.md
BEGIN;

-- DropForeignKey
ALTER TABLE "ticket_orders" DROP CONSTRAINT "ticket_orders_eventId_fkey";

-- DropForeignKey
ALTER TABLE "ticket_orders" DROP CONSTRAINT "ticket_orders_buyerId_fkey";

-- DropForeignKey
ALTER TABLE "ticket_orders" DROP CONSTRAINT "ticket_orders_sellerId_fkey";

-- AddForeignKey
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
