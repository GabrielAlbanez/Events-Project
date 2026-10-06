export type DiscoveryPeriod = "todos" | "hoje" | "fim-de-semana" | "mes";
export function parseEventDate(value: string) {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
export function matchesPeriod(event: { dataInicio: string; dataFim?: string }, period: DiscoveryPeriod, now = new Date()) {
  if (period === "todos") return true;
  const start = parseEventDate(event.dataInicio);
  if (!start) return false;
  const end = parseEventDate(event.dataFim || event.dataInicio) || start;
  const eventEnd = new Date(Math.max(start.getTime(), end.getTime()));
  eventEnd.setHours(23, 59, 59, 999);
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const until = new Date(from);
  if (period === "hoje") until.setDate(until.getDate() + 1);
  else if (period === "mes") { from.setDate(1); until.setMonth(until.getMonth() + 1, 1); }
  else {
    const day = from.getDay();
    from.setDate(from.getDate() + (day === 0 ? -1 : (6 - day + 7) % 7));
    until.setTime(from.getTime()); until.setDate(until.getDate() + 2);
  }
  return start < until && eventEnd >= from;
}
