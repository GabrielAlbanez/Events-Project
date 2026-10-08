CREATE TABLE IF NOT EXISTS "MobileEventMedia" (
  id text PRIMARY KEY,
  "ownerId" text REFERENCES "User"(id) ON DELETE SET NULL,
  "mimeType" text NOT NULL,
  size integer NOT NULL CHECK (size > 0 AND size <= 5242880),
  content bytea NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE "MobileEventMedia" ALTER COLUMN "ownerId" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "PrivateChatMedia" (
  id text PRIMARY KEY,
  "eventId" text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  "matchId" text NOT NULL REFERENCES "PartyMatch"(id) ON DELETE CASCADE,
  "uploaderId" text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "contentType" text NOT NULL,
  bytes bytea NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "PrivateChatMedia_match_created_idx"
  ON "PrivateChatMedia" ("matchId", "createdAt");

CREATE TABLE IF NOT EXISTS "PartyMessageMedia" (
  "matchId" text NOT NULL REFERENCES "PartyMatch"(id) ON DELETE CASCADE,
  "authorId" text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "clientId" text NOT NULL,
  "mediaId" text NOT NULL REFERENCES "PrivateChatMedia"(id) ON DELETE CASCADE,
  PRIMARY KEY ("matchId", "authorId", "clientId")
);

CREATE TABLE IF NOT EXISTS "PartyMessageReceipt" (
  "matchId" text NOT NULL REFERENCES "PartyMatch"(id) ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "deliveredThrough" integer NOT NULL DEFAULT 0,
  "readThrough" integer NOT NULL DEFAULT 0,
  "typingUntil" timestamptz,
  PRIMARY KEY ("matchId", "userId")
);
