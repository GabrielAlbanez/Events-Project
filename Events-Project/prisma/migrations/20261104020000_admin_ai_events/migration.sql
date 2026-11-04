-- Additive import queue. No existing event is modified or published.
CREATE TABLE "AiEventAutomation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "city" TEXT NOT NULL DEFAULT 'São Paulo',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "maxPerRun" INTEGER NOT NULL DEFAULT 3 CHECK ("maxPerRun" BETWEEN 1 AND 5),
  "authorizedBy" TEXT,
  "authorizedAt" TIMESTAMP(3),
  "nextRunAt" TIMESTAMP(3),
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "AiEventRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "automationId" TEXT NOT NULL REFERENCES "AiEventAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "requestedBy" TEXT NOT NULL,
  "trigger" TEXT NOT NULL CHECK ("trigger" IN ('MANUAL', 'HOURLY', 'SOURCE')),
  "sourceUrl" TEXT,
  "city" TEXT NOT NULL,
  "maxPerRun" INTEGER NOT NULL CHECK ("maxPerRun" BETWEEN 1 AND 5),
  "status" TEXT NOT NULL DEFAULT 'QUEUED' CHECK ("status" IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "message" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AiEventRun_status_createdAt_idx" ON "AiEventRun"("status", "createdAt");
CREATE TABLE "AiEventCandidate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "runId" TEXT NOT NULL REFERENCES "AiEventRun"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "sourceUrl" TEXT NOT NULL UNIQUE,
  "sourceHash" TEXT NOT NULL,
  "sourceVerifiedAt" TIMESTAMP(3) NOT NULL,
  "name" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "address" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'PUBLISHED', 'REJECTED')),
  "eventId" TEXT UNIQUE REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AiEventCandidate_status_createdAt_idx" ON "AiEventCandidate"("status", "createdAt");
