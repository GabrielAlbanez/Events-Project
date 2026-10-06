type Action = 'view' | 'ticket';
interface Entry { until: number; pending?: Promise<Response> }
/** Web cookies are unavailable to bearer clients. Keep the same bounded windows on the adapter. */
export class EngagementWindow {
  private readonly entries = new Map<string, Entry>();
  constructor(private readonly capacity = 10000, private readonly now: () => number = Date.now) {}
  get size(): number { return this.entries.size; }
  async run(actor: string, eventId: string, action: Action, execute: () => Promise<Response>): Promise<Response> {
    const key = JSON.stringify([actor, eventId, action]);
    const now = this.now();
    for (const [id, entry] of this.entries) if (!entry.pending && entry.until <= now) this.entries.delete(id);
    const existing = this.entries.get(key);
    if (existing?.pending) return (await existing.pending).clone();
    if (existing && existing.until > now) return Response.json({ success: true });
    while (this.entries.size >= this.capacity) {
      const oldest = [...this.entries].find(([, entry]) => !entry.pending);
      if (!oldest) return Response.json({ message: 'Aguarde antes de tentar novamente.' }, { status: 503 });
      this.entries.delete(oldest[0]);
    }
    const entry: Entry = { until: now };
    const pending = Promise.resolve().then(execute);
    entry.pending = pending;
    this.entries.set(key, entry);
    try {
      const result = await pending;
      if (result.ok) { entry.until = this.now() + (action === 'view' ? 3600000 : 60000); delete entry.pending; }
      else this.entries.delete(key);
      return result.clone();
    } catch (error) { this.entries.delete(key); throw error; }
  }
}
