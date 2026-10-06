CREATE TYPE "EventHistoryAction" AS ENUM ('CREATED', 'VALIDATED', 'DELETED');

CREATE TABLE "EventHistory" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "promoterId" TEXT,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT,
    "action" "EventHistoryAction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventHistory_eventId_createdAt_idx" ON "EventHistory"("eventId", "createdAt");
CREATE INDEX "EventHistory_promoterId_createdAt_idx" ON "EventHistory"("promoterId", "createdAt");

-- Existing validation timestamps are real audit evidence; older creation times are unknown.
INSERT INTO "EventHistory" ("id", "eventId", "eventName", "promoterId", "actorId", "actorName", "action", "createdAt")
SELECT e."id" || '-validated-backfill', e."id", e."nome", e."userId", e."validatedBy", u."name", 'VALIDATED'::"EventHistoryAction", e."validatedAt"
FROM "events" e
LEFT JOIN "User" u ON u."id" = e."validatedBy"
WHERE e."validate" = true AND e."validatedBy" IS NOT NULL AND e."validatedAt" IS NOT NULL;
