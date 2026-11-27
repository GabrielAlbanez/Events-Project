import type { PartyInboxItem } from "@/types/partyConnections";

/** Event dates are stored as "YYYY-MM-DD" (local day) or ISO strings; anything else stays hidden. */
export function formatEventDay(value: string | undefined): string {
  if (!value) return "";
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" }).formatToParts(date);
  const dayPart = parts.find(part => part.type === "day")?.value ?? "";
  const month = (parts.find(part => part.type === "month")?.value ?? "").replace(".", "");
  return `${dayPart} ${month}`.trim();
}

export function matchBadgeLabel(event: { name: string; date?: string }): string {
  const day = formatEventDay(event.date);
  return `Match em ${event.name}${day ? ` · ${day}` : ""}`;
}

export function inboxPreview(item: Pick<PartyInboxItem, "lastMessage">): string {
  return item.lastMessage ? `${item.lastMessage.own ? "Você: " : ""}${item.lastMessage.text || "Foto"}` : "Vocês deram match. Diga oi!";
}

/** Today shows the time, yesterday says "Ontem", older shows the day. */
export function formatActivity(iso: string | undefined, now = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (days <= 0) return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
  if (days === 1) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
}

/** Only events that appear in the loaded conversations, in order of first appearance. */
export function inboxEvents(items: PartyInboxItem[]): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const item of items) if (!seen.has(item.event.id)) seen.set(item.event.id, item.event.name);
  return Array.from(seen, ([id, name]) => ({ id, name }));
}

export function filterInbox(items: PartyInboxItem[], query: string, eventId: string | null): PartyInboxItem[] {
  const term = query.trim().toLocaleLowerCase("pt-BR");
  return items.filter(item => (!eventId || item.event.id === eventId) && (!term || item.profile.displayName.toLocaleLowerCase("pt-BR").includes(term) || item.event.name.toLocaleLowerCase("pt-BR").includes(term)));
}

export function inboxUnreadTotal(items: Pick<PartyInboxItem, "unreadCount">[]): number {
  return items.reduce((total, item) => total + (item.unreadCount ?? 0), 0);
}

export function conversationHref(matchId: string): string {
  return `/conversas/${encodeURIComponent(matchId)}`;
}
