CREATE TABLE "ImpersonationSession" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "ip" TEXT,
  "adminAccountId" TEXT,
  "userAccountId" TEXT,
  CONSTRAINT "ImpersonationSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ImpersonationSession_userId_endedAt_expiresAt_idx" ON "ImpersonationSession"("userId", "endedAt", "expiresAt");
CREATE INDEX "ImpersonationSession_adminId_startedAt_idx" ON "ImpersonationSession"("adminId", "startedAt");
ALTER TABLE "ImpersonationSession" ADD CONSTRAINT "ImpersonationSession_adminAccountId_fkey" FOREIGN KEY ("adminAccountId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImpersonationSession" ADD CONSTRAINT "ImpersonationSession_userAccountId_fkey" FOREIGN KEY ("userAccountId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
