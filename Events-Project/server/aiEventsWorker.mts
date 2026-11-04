import type { PrismaClient } from "@prisma/client";
import { pollAiEvents } from "../lib/aiEvents/service.js";

export function startAiEventsWorker(db: PrismaClient): () => void {
  let stopped = false, running = false, failed = false;
  async function poll() {
    if (stopped || running) return;
    running = true;
    try { await pollAiEvents(db); failed = false; }
    catch { if (!failed) console.warn("AI event queue temporarily unavailable; check server setup."); failed = true; }
    finally { running = false; }
  }
  const timer = setInterval(() => { void poll(); }, 30000);
  timer.unref(); void poll();
  return () => { stopped = true; clearInterval(timer); };
}
