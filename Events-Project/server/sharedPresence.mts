import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type PresenceOptions = {
  getLocalUserIds: () => string[];
  onChange: (userIds: string[]) => void | Promise<void>;
  directory?: string;
  now?: () => number;
  intervalMs?: number;
  ttlMs?: number;
};

const maxUsers = 10_000;
const maxSnapshotBytes = 3_000_000;
const instanceFile = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/;
const validIds = (value: unknown): value is string[] => Array.isArray(value) && value.length <= maxUsers &&
  value.every(id => typeof id === "string" && id.length > 0 && id.length <= 256);

// Local IPC only: both servers must run on the same host, checkout and database.
// The database URL is hashed; snapshots contain only authenticated user IDs.
export function createSharedPresence(options: PresenceOptions) {
  const namespace = createHash("sha256").update(process.cwd()).update("\0")
    .update(process.env.DATABASE_URL ?? "").digest("hex");
  const directory = options.directory ?? join(tmpdir(), "eventmap-presence", namespace);
  const file = join(directory, `${randomUUID()}.json`);
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? 10_000;
  let snapshot: string[] = [];
  let stopped = false;
  let warned = false;
  let pending: Promise<void> = Promise.resolve();

  const reportFailure = () => {
    if (!warned) console.warn("Shared presence synchronization unavailable.");
    warned = true;
  };
  const refresh = async () => {
    if (stopped) return;
    const local = options.getLocalUserIds();
    if (!validIds(local)) throw new Error("Invalid local presence snapshot");
    const uniqueLocal = Array.from(new Set(local));
    const timestamp = now();
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = file + ".tmp";
    try {
      await writeFile(temporary, JSON.stringify({ updatedAt: timestamp, userIds: uniqueLocal }), { mode: 0o600 });
      await rename(temporary, file);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
    const union = new Set(uniqueLocal);
    const entries = await readdir(directory);
    for (const entry of entries) {
      if (!instanceFile.test(entry) || join(directory, entry) === file) continue;
      const path = join(directory, entry);
      try {
        const info = await lstat(path);
        if (!info.isFile() || info.size > maxSnapshotBytes) continue;
        const content = await readFile(path);
        if (content.length > maxSnapshotBytes) continue;
        const parsed: unknown = JSON.parse(content.toString("utf8"));
        if (typeof parsed !== "object" || parsed === null) continue;
        const record = parsed as { updatedAt?: unknown; userIds?: unknown };
        if (typeof record.updatedAt !== "number" || !Number.isFinite(record.updatedAt) ||
          record.updatedAt > timestamp + ttlMs || !validIds(record.userIds)) continue;
        if (timestamp - record.updatedAt > ttlMs) continue;
        for (const userId of record.userIds) union.add(userId);
      } catch (error) {
        // Another process can remove its file during shutdown; malformed records
        // are ignored without exposing their contents or blocking local presence.
        if (!(error instanceof SyntaxError) && (error as NodeJS.ErrnoException).code !== "ENOENT") reportFailure();
      }
    }
    const next = Array.from(union).sort();
    warned = false;
    if (next.length !== snapshot.length || next.some((id, index) => id !== snapshot[index])) {
      snapshot = next;
      if (!stopped) await options.onChange([...snapshot]);
    }
  };
  const poll = (): Promise<void> => {
    pending = pending.then(refresh).catch(reportFailure);
    return pending;
  };
  // Schedule the next heartbeat after completion to avoid overlapping polls.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const heartbeat = async () => {
    await poll();
    if (!stopped) {
      timer = setTimeout(() => { void heartbeat(); }, options.intervalMs ?? 2_000);
      timer.unref();
    }
  };
  void heartbeat();
  return {
    poll,
    getSnapshot: (): string[] => [...snapshot],
    stop: async (): Promise<void> => {
      stopped = true;
      if (timer) clearTimeout(timer);
      await pending;
      await unlink(file).catch(() => undefined);
      await unlink(file + ".tmp").catch(() => undefined);
    },
  };
}
