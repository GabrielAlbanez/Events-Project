import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

const presenceLifetimeSeconds = 15;
const heartbeatIntervalMs = 3_000;
const validUserId = /^[A-Za-z0-9_-]{1,128}$/;

export class PostgresRealtimePresence {
  private readonly instanceId = randomUUID();
  private userIds: string[] = [];
  private timer: NodeJS.Timeout | null = null;
  private pending: Promise<void> | null = null;
  private dirty = false;
  private stopped = false;

  constructor(
    private readonly pool: Pool,
    private readonly platform: 'web' | 'mobile',
  ) {}

  start(): void {
    if (this.stopped || this.timer) return;
    void this.publish();
    this.timer = setInterval(() => { void this.publish(); }, heartbeatIntervalMs);
    this.timer.unref();
  }

  updateUsers(userIds: readonly string[]): void {
    if (this.stopped) return;
    if (userIds.some(userId => !validUserId.test(userId))) {
      throw new Error('Invalid realtime presence user id.');
    }
    this.userIds = [...new Set(userIds)].sort();
    void this.publish();
  }

  async readActiveUserIds(): Promise<string[]> {
    const result = await this.pool.query(
      `SELECT DISTINCT presence_user.user_id AS "userId"
       FROM "RealtimePresenceSnapshot" snapshot
       CROSS JOIN LATERAL unnest(snapshot."userIds") AS presence_user(user_id)
       WHERE snapshot."updatedAt" >= NOW() - ($1 * INTERVAL '1 second')
       ORDER BY "userId"`,
      [presenceLifetimeSeconds],
    );
    return result.rows
      .map(row => row.userId)
      .filter((userId): userId is string => typeof userId === 'string' && validUserId.test(userId));
  }

  async close(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.pending;
    await this.pool.query(
      `DELETE FROM "RealtimePresenceSnapshot" WHERE "instanceId" = $1`,
      [this.instanceId],
    );
  }

  private publish(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.pending) {
      this.dirty = true;
      return this.pending;
    }
    this.pending = (async () => {
      do {
        this.dirty = false;
        await this.pool.query(
          `INSERT INTO "RealtimePresenceSnapshot" ("instanceId", platform, "userIds", "updatedAt")
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT ("instanceId") DO UPDATE
           SET platform = EXCLUDED.platform,
               "userIds" = EXCLUDED."userIds",
               "updatedAt" = EXCLUDED."updatedAt"`,
          [this.instanceId, this.platform, this.userIds],
        );
        await this.pool.query(
          `DELETE FROM "RealtimePresenceSnapshot"
           WHERE "updatedAt" < NOW() - INTERVAL '1 minute'`,
        );
      } while (this.dirty && !this.stopped);
    })()
      .catch(error => {
        console.error('Unable to publish cross-platform realtime presence:', error instanceof Error ? error.message : 'unknown error');
      })
      .finally(() => { this.pending = null; });
    return this.pending;
  }
}
