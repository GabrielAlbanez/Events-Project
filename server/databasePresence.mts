import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

const presenceLifetimeSeconds = 15;
const heartbeatIntervalMs = 3_000;
const validUserId = /^[A-Za-z0-9_-]{1,128}$/;

type PresenceOptions = {
  prisma: PrismaClient;
  getLocalUserIds: () => string[];
  onChange: (userIds: string[]) => void | Promise<void>;
};

export function createDatabasePresence(options: PresenceOptions) {
  const instanceId = randomUUID();
  let snapshot: string[] = [];
  let stopped = false;
  let pending: Promise<void> | null = null;
  let timer: NodeJS.Timeout | null = null;

  const readSnapshot = async (): Promise<string[]> => {
    const rows = await options.prisma.$queryRaw<Array<{ userId: string }>>`
      SELECT DISTINCT presence_user.user_id AS "userId"
      FROM "RealtimePresenceSnapshot" snapshot
      CROSS JOIN LATERAL unnest(snapshot."userIds") AS presence_user(user_id)
      WHERE snapshot."updatedAt" >= NOW() - (${presenceLifetimeSeconds} * INTERVAL '1 second')
      ORDER BY "userId"
    `;
    return rows
      .map(row => row.userId)
      .filter(userId => typeof userId === "string" && validUserId.test(userId));
  };

  const publish = async (): Promise<void> => {
    if (stopped) return;
    if (pending) return pending;
    pending = (async () => {
      const localUserIds = Array.from(new Set(options.getLocalUserIds())).sort();
      if (localUserIds.length > 10_000 || localUserIds.some(userId => !validUserId.test(userId))) {
        throw new Error("Invalid local realtime presence snapshot.");
      }
      await options.prisma.$executeRaw`
        INSERT INTO "RealtimePresenceSnapshot" ("instanceId", platform, "userIds", "updatedAt")
        VALUES (${instanceId}, 'web', ${localUserIds}::text[], NOW())
        ON CONFLICT ("instanceId") DO UPDATE
        SET platform = EXCLUDED.platform,
            "userIds" = EXCLUDED."userIds",
            "updatedAt" = EXCLUDED."updatedAt"
      `;
      await options.prisma.$executeRaw`
        DELETE FROM "RealtimePresenceSnapshot"
        WHERE "updatedAt" < NOW() - INTERVAL '1 minute'
      `;
      const next = await readSnapshot();
      if (next.length !== snapshot.length || next.some((userId, index) => userId !== snapshot[index])) {
        snapshot = next;
        if (!stopped) await options.onChange([...snapshot]);
      }
    })()
      .catch(error => {
        console.error("Unable to synchronize cross-platform realtime presence:", error instanceof Error ? error.message : "unknown error");
      })
      .finally(() => { pending = null; });
    return pending;
  };

  const heartbeat = async (): Promise<void> => {
    await publish();
    if (!stopped) {
      timer = setTimeout(() => { void heartbeat(); }, heartbeatIntervalMs);
      timer.unref();
    }
  };
  void heartbeat();

  return {
    poll: publish,
    getSnapshot: (): string[] => [...snapshot],
    async stop(): Promise<void> {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      await pending;
      await options.prisma.$executeRaw`
        DELETE FROM "RealtimePresenceSnapshot" WHERE "instanceId" = ${instanceId}
      `;
      snapshot = await readSnapshot();
      await options.onChange([...snapshot]);
    },
  };
}
