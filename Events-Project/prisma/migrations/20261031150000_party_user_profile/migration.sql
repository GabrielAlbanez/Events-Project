CREATE TABLE "PartyUserProfile" (
  "userId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "photoUrl" TEXT NOT NULL DEFAULT '',
  "bio" TEXT NOT NULL DEFAULT '',
  "interests" TEXT[] NOT NULL,
  "intent" TEXT NOT NULL,
  "adultDeclared" BOOLEAN NOT NULL DEFAULT false,
  "needsReview" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartyUserProfile_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "PartyUserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Seed a private draft only. Existing opt-ins, photos, preferences and matches stay untouched.
INSERT INTO "PartyUserProfile" ("userId", "displayName", "photoUrl", "bio", "interests", "intent", "adultDeclared", "needsReview", "updatedAt")
SELECT DISTINCT ON ("userId") "userId", "displayName", "photoUrl", "bio", "interests", "intent", "adultDeclared", true, "updatedAt"
FROM "PartyProfile"
ORDER BY "userId", "updatedAt" DESC, "eventId" ASC;
