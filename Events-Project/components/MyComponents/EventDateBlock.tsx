import { parseEventDate } from "@/lib/discoveryPeriod";

type EventDateBlockProps = {
  date: string | null | undefined;
  className?: string;
  size?: "xs" | "sm" | "md";
};

const weekdayFormat = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });
const monthFormat = new Intl.DateTimeFormat("pt-BR", { month: "short" });
const fullFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" });

/** "sáb." → "SÁB" (some ICU builds omit the dot; stripping keeps server and client output equal). */
const shortPart = (value: string) => value.replace(/\./g, "").toLocaleUpperCase("pt-BR");
const pad = (value: number) => String(value).padStart(2, "0");

const sizes = {
  xs: { box: "flex-row gap-1 rounded-md px-1.5 py-0.5", small: "text-[10px] leading-4", day: "text-xs leading-4" },
  sm: { box: "flex-col min-w-[2.75rem] rounded-lg px-1.5 py-1", small: "text-[10px] leading-3", day: "text-lg leading-5" },
  md: { box: "flex-col min-w-[3.5rem] rounded-xl px-2 py-1.5", small: "text-[11px] leading-4", day: "text-2xl leading-7" },
} as const;

/**
 * Calendar-style date chip (weekday / day / month); `xs` is a compact single-line badge for small thumbnails. Server-safe: no hooks or browser APIs.
 * `YYYY-MM-DD` values are read as local calendar dates via `parseEventDate` (no UTC off-by-one).
 */
export function EventDateBlock({ date, className = "", size = "md" }: EventDateBlockProps) {
  const parsed = date ? parseEventDate(date) : null;
  const style = sizes[size];
  const box = `inline-flex items-center justify-center border border-border bg-card text-center text-card-foreground shadow-surface ${style.box} ${className}`;
  if (!parsed) {
    return (
      <span className={box}>
        <span className={`${style.small} font-semibold`}>Data</span>
        <span className={`${style.small} font-medium text-muted-foreground`}>a confirmar</span>
      </span>
    );
  }
  const isoDay = `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
  return (
    <time dateTime={isoDay} className={box}>
      <span className="sr-only">{fullFormat.format(parsed)}</span>
      <span aria-hidden="true" className={`${style.small} font-semibold tracking-wide text-brand`}>{shortPart(weekdayFormat.format(parsed))}</span>
      <span aria-hidden="true" className={`${style.day} font-bold tabular-nums tracking-tight`}>{parsed.getDate()}</span>
      <span aria-hidden="true" className={`${style.small} font-semibold tracking-wide text-muted-foreground`}>{shortPart(monthFormat.format(parsed))}</span>
    </time>
  );
}
