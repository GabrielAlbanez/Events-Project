-- Additive: existing rows keep their content and appear in the System category.
ALTER TABLE "Notification"
  ADD COLUMN "type" TEXT NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN "groupKey" TEXT;
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");
