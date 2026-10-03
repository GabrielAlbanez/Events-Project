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
  const timer = setInterval(() => { void poller.poll(); }, 2000);
  timer.unref();
  void poller.poll();
  return () => { clearInterval(timer); poller.stop(); };
}
