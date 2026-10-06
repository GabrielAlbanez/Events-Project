import type { PrismaClient } from "@prisma/client";

const RETENTION_MS = 24 * 60 * 60 * 1000;

/** Single Socket.IO server outbox. Acknowledge only after emission, so failures
 * replay safely and late commits remain pending regardless of sequence ID. */
export function createCommunityPoller(prisma: PrismaClient, emit: (room: string) => Promise<void>, now = Date.now) {
  let running = false;
  let stopped = false;
  let lastCleanup = 0;
  let failed = false;
  let cursor = 0;
  let ceiling: number | null = null;
  async function poll(): Promise<void> {
    if (running || stopped) return;
    running = true;
    try {
      const cutoff = now() - RETENTION_MS;
      const started = now();
      let roomFailed = false;
      if (ceiling === null) {
        // Freeze the sweep boundary: continuous new rows must not postpone
        // retries or lower sequence IDs that commit after this sweep started.
        const newest = await prisma.communitySignal.findFirst({ where: { deliveredAt: null }, orderBy: { id: "desc" }, select: { id: true } });
        ceiling = newest?.id ?? 0;
      }
      for (let batch = 0; batch < 5 && !stopped && now() - started < 1000; batch++) {
        const entries = await prisma.communitySignal.findMany({ where: { deliveredAt: null, id: { gt: cursor, lte: ceiling } }, orderBy: { id: "asc" }, take: 200, select: { id: true, room: true } });
        if (!entries.length) { cursor = 0; ceiling = null; break; }
        for (const room of Array.from(new Set(entries.map(entry => entry.room)))) {
          if (stopped || now() - started >= 1000) break;
          try {
            await emit(room);
            if (stopped) break;
            await prisma.communitySignal.updateMany({ where: { id: { in: entries.filter(entry => entry.room === room).map(entry => entry.id) }, deliveredAt: null }, data: { deliveredAt: new Date(now()) } });
          } catch { roomFailed = true; }
        }
        // A failed room remains pending while other rooms keep progressing.
        cursor = entries[entries.length - 1].id;
        if (entries.length < 200 || cursor >= ceiling) { cursor = 0; ceiling = null; break; }
      }
      if (!stopped && now() - lastCleanup > 60 * 60 * 1000) {
        // Pending rows are never expired; an outage must not discard mutations.
        await prisma.communitySignal.deleteMany({ where: { deliveredAt: { lt: new Date(cutoff) } } });
        lastCleanup = now();
      }
      if (roomFailed && !failed) console.error("Community updates temporarily unavailable.");
      failed = roomFailed;
    } catch {
      if (!failed) console.error("Community updates temporarily unavailable.");
      failed = true;
    } finally { running = false; }
  }
  return { poll, stop: () => { stopped = true; } };
}

export function startCommunityWorker(prisma: PrismaClient, emit: (room: string) => Promise<void>): () => void {
  const poller = createCommunityPoller(prisma, emit);
  const replay = createCommunityReplay(prisma, emit);
  const timer = setInterval(() => { void poller.poll(); void replay.poll(); }, 1000);
  timer.unref();
  void poller.poll();
  return () => { clearInterval(timer); poller.stop(); replay.stop(); };
}

/** Every server must observe signals acknowledged by another server. Payloads
 * contain room names only; dispatch reauthorizes each recipient independently. */
export function createCommunityReplay(prisma: PrismaClient, emit: (room: string) => Promise<void>, now = Date.now) {
  const seen = new Map<number, number>();
  let running = false, stopped = false;
  let failed = false;
  async function poll() {
    if (running || stopped) return;
    running = true;
    try {
      const cutoff = now() - 30_000;
      for (const [id, timestamp] of Array.from(seen)) if (timestamp < cutoff) seen.delete(id);
      const entries = await prisma.communitySignal.findMany({ where: { deliveredAt: { gte: new Date(cutoff) } }, orderBy: { deliveredAt: "desc" }, take: 2000, select: { id: true, room: true, deliveredAt: true } });
      const fresh = entries.filter(entry => !seen.has(entry.id));
      let roomFailed = false;
      for (const room of Array.from(new Set(fresh.map(entry => entry.room)))) {
        if (stopped) break;
        try {
          await emit(room);
          for (const entry of fresh) if (entry.room === room) seen.set(entry.id, entry.deliveredAt!.getTime());
        } catch { roomFailed = true; }
      }
      if (roomFailed && !failed) console.error("Community synchronization temporarily unavailable.");
      failed = roomFailed;
    } catch {
      if (!failed) console.error("Community synchronization temporarily unavailable.");
      failed = true;
    }
    finally { running = false; }
  }
  return { poll, stop: () => { stopped = true; seen.clear(); } };
}
