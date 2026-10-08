CREATE TABLE IF NOT EXISTS "RealtimePresenceSnapshot" (
  "instanceId" text PRIMARY KEY,
  platform text NOT NULL CHECK (platform IN ('web', 'mobile')),
  "userIds" text[] NOT NULL DEFAULT '{}',
  "updatedAt" timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "RealtimePresenceSnapshot_updatedAt_idx"
  ON "RealtimePresenceSnapshot" ("updatedAt");
