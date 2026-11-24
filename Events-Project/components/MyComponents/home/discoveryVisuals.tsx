import { BookOpen, Drama, Dumbbell, Film, Gamepad2, GraduationCap, Laptop, Mic, Music, Palette, PartyPopper, Trees, Trophy, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { parseEventDate } from "@/lib/discoveryPeriod";

type CategoryVisual = { icon: LucideIcon; tone: string };

/** Icon + soft tint for the category tiles; unknown names fall back to a neutral party icon. */
const categoryVisuals: Record<string, CategoryVisual> = {
  musica: { icon: Music, tone: "bg-violet-500/10 text-violet-600 dark:text-violet-300" },
  show: { icon: Mic, tone: "bg-violet-500/10 text-violet-600 dark:text-violet-300" },
  shows: { icon: Mic, tone: "bg-violet-500/10 text-violet-600 dark:text-violet-300" },
  games: { icon: Gamepad2, tone: "bg-primary/10 text-brand" },
  jogos: { icon: Gamepad2, tone: "bg-primary/10 text-brand" },
  cultura: { icon: Drama, tone: "bg-sky-500/10 text-sky-600 dark:text-sky-300" },
  teatro: { icon: Drama, tone: "bg-sky-500/10 text-sky-600 dark:text-sky-300" },
  cinema: { icon: Film, tone: "bg-sky-500/10 text-sky-600 dark:text-sky-300" },
  arte: { icon: Palette, tone: "bg-pink-500/10 text-pink-600 dark:text-pink-300" },
  gastronomia: { icon: UtensilsCrossed, tone: "bg-foreground/[.06] text-foreground" },
  esporte: { icon: Trophy, tone: "bg-amber-500/15 text-amber-600 dark:text-amber-300" },
  esportes: { icon: Trophy, tone: "bg-amber-500/15 text-amber-600 dark:text-amber-300" },
  fitness: { icon: Dumbbell, tone: "bg-amber-500/15 text-amber-600 dark:text-amber-300" },
  educacao: { icon: GraduationCap, tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  palestra: { icon: BookOpen, tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  tecnologia: { icon: Laptop, tone: "bg-primary/10 text-brand" },
  natureza: { icon: Trees, tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
};
const fallbackVisual: CategoryVisual = { icon: PartyPopper, tone: "bg-cta/25 text-foreground" };

const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLocaleLowerCase("pt-BR");

export function categoryVisual(category: string): CategoryVisual {
  return categoryVisuals[normalize(category)] ?? fallbackVisual;
}

/**
 * "Rua X, 10 - Centro, Campinas - SP, 13000-000, Brasil" or "Rua X, Campinas, SP" → "Campinas, SP".
 * Returns null when the address has no recognizable city/UF pair (it is only a display/filter hint).
 */
export function eventCity(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  for (let index = parts.length - 1; index >= 0; index--) {
    const joined = /^([^\d]+?)\s+-\s+([A-Z]{2})$/.exec(parts[index]);
    if (joined) return `${joined[1].trim()}, ${joined[2]}`;
    if (/^[A-Z]{2}$/.test(parts[index]) && index > 0 && !/\d/.test(parts[index - 1])) {
      const city = parts[index - 1].split(" - ").pop()?.trim();
      if (city) return `${city}, ${parts[index]}`;
    }
  }
  return null;
}

const monthFormat = new Intl.DateTimeFormat("pt-BR", { month: "short" });
const fullFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" });

/** Compact "29 / NOV" block used by the discovery list and the map card. Server-safe. */
export function DayMonthBlock({ date, className = "" }: { date: string | null | undefined; className?: string }) {
  const parsed = date ? parseEventDate(date) : null;
  const box = `inline-flex min-w-[2.75rem] shrink-0 flex-col items-center justify-center rounded-xl border border-border bg-card px-1.5 py-1 text-center text-card-foreground ${className}`;
  if (!parsed) return <span className={box}><span className="text-[10px] font-semibold leading-3 text-muted-foreground">Data a confirmar</span></span>;
  return (
    <time dateTime={`${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`} className={box}>
      <span className="sr-only">{fullFormat.format(parsed)}</span>
      <span aria-hidden="true" className="text-lg font-bold leading-5 tabular-nums tracking-tight">{String(parsed.getDate()).padStart(2, "0")}</span>
      <span aria-hidden="true" className="text-[10px] font-semibold uppercase leading-3 tracking-wide text-muted-foreground">{monthFormat.format(parsed).replace(/\./g, "")}</span>
    </time>
  );
}

/** Lime "Em destaque" tag for paid highlights; the accessible name says it is sponsored. */
export function FeaturedTag({ className = "" }: { className?: string }) {
  return (
    <span role="note" aria-label="Evento em destaque patrocinado" title="Evento em destaque patrocinado" className={`inline-flex items-center gap-1 rounded-full bg-cta px-2 py-0.5 text-[10px] font-semibold leading-4 text-cta-foreground shadow-sm ${className}`}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-2.5 w-2.5 fill-current"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z" /></svg>
      <span aria-hidden="true">Em destaque</span>
    </span>
  );
}
