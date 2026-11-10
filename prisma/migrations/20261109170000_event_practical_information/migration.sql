-- Optional public information remains empty until supplied by the publisher.
ALTER TABLE "events"
ADD COLUMN "organizerName" TEXT NOT NULL DEFAULT '',
ADD COLUMN "ageRating" TEXT NOT NULL DEFAULT '',
ADD COLUMN "accessibilityInfo" TEXT NOT NULL DEFAULT '',
ADD COLUMN "participationInfo" TEXT NOT NULL DEFAULT '';
