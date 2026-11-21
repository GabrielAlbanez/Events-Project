-- Optional public information remains empty until supplied by the publisher.
ALTER TABLE "events"
ADD COLUMN "organizerName" TEXT NOT NULL DEFAULT '';
-- Classification, accessibility and participation already exist in production.
