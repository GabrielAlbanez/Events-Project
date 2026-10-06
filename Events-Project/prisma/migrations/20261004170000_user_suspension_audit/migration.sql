ALTER TABLE "User" ADD COLUMN "suspendedAt" TIMESTAMP(3), ADD COLUMN "suspendedUntil" TIMESTAMP(3), ADD COLUMN "suspensionReason" TEXT, ADD COLUMN "suspendedById" TEXT, ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImpersonationSession" ADD COLUMN "reason" TEXT NOT NULL DEFAULT '';
CREATE TABLE "UserSuspensionAudit" ("id" TEXT NOT NULL, "actorId" TEXT NOT NULL, "userId" TEXT NOT NULL, "action" TEXT NOT NULL, "reason" TEXT NOT NULL, "until" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "UserSuspensionAudit_pkey" PRIMARY KEY ("id"));
CREATE INDEX "UserSuspensionAudit_userId_createdAt_idx" ON "UserSuspensionAudit"("userId", "createdAt");
CREATE INDEX "UserSuspensionAudit_actorId_createdAt_idx" ON "UserSuspensionAudit"("actorId", "createdAt");
