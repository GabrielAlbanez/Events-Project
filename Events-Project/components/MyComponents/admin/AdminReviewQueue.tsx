"use client";

import { memo, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { m, useReducedMotion } from "framer-motion";
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Button as HeroButton } from "@heroui/react";
import { AlertTriangle, CalendarDays, Check, ChevronRight, ImageOff, MapPin, MoreHorizontal } from "lucide-react";
import { EventStatusBadge } from "@/components/ui/status-badge";
import { importedBadge } from "@/lib/aiEvents/sources";
import { effectiveStatus, formatPrice, formatSchedule, organizerOf, queueTabs, reviewProblems, type QueueTab } from "@/lib/adminReviewQueue";
import { cn } from "@/lib/utils";
import type { Evento } from "@/types";
import { reviewEase, reviewSpring, statusAccent, tabAccent } from "./adminReviewTheme";

export const queuePanelId = "admin-review-queue-panel";
const tabId = (tab: QueueTab) => `admin-review-tab-${tab}`;
const useSafeLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Animated number for sighted users; assistive tech reads only the final value. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const reduced = useReducedMotion();
  const node = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  useSafeLayoutEffect(() => {
    const element = node.current;
    if (!element) return;
    const from = shown.current;
    shown.current = value;
    if (reduced || from === value) { element.textContent = String(value); return; }
    element.textContent = String(from);
    let frame = 0;
    const start = performance.now();
    const tick = (time: number) => {
      const progress = Math.min((time - start) / 600, 1);
      element.textContent = String(Math.round(from + (value - from) * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); element.textContent = String(value); };
  }, [value, reduced]);
  return <span className={className}><span ref={node} aria-hidden="true">{value}</span><span className="sr-only">{value}</span></span>;
}

export function QueueTabs({ active, counts, onChange }: { active: QueueTab; counts: Record<QueueTab, number>; onChange: (tab: QueueTab) => void }) {
  const refs = useRef<Partial<Record<QueueTab, HTMLButtonElement | null>>>({});
  useEffect(() => { refs.current[active]?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [active]);
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = queueTabs.findIndex(tab => tab.id === active);
    const target = event.key === "ArrowRight" ? (index + 1) % queueTabs.length : event.key === "ArrowLeft" ? (index - 1 + queueTabs.length) % queueTabs.length : event.key === "Home" ? 0 : event.key === "End" ? queueTabs.length - 1 : -1;
    if (target < 0) return;
    event.preventDefault();
    onChange(queueTabs[target].id);
    refs.current[queueTabs[target].id]?.focus();
  }
  return <div role="tablist" aria-label="Filas de revisão" onKeyDown={onKeyDown} className="flex gap-0.5 overflow-x-auto border-b border-border [scrollbar-width:none]">
    {queueTabs.map(tab => {
      const selected = tab.id === active;
      const count = counts[tab.id];
      return <button key={tab.id} ref={node => { refs.current[tab.id] = node; }} id={tabId(tab.id)} type="button" role="tab" aria-selected={selected} aria-controls={queuePanelId} tabIndex={selected ? 0 : -1} onClick={() => onChange(tab.id)} className={cn(tabAccent[tab.id], "relative inline-flex min-h-12 shrink-0 items-center gap-2 rounded-t-lg px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none", selected ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
        {tab.label}
        <span data-empty={count === 0 ? "true" : undefined} className={cn("min-w-5 rounded-full px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums", count === 0 ? "bg-transparent font-medium text-muted-foreground" : selected ? "bg-[hsl(var(--status)/0.14)] text-[hsl(var(--status))]" : "bg-muted text-foreground/80")}>{count}</span>
        {selected && <m.span layoutId="admin-review-tab-indicator" transition={reviewSpring} aria-hidden="true" className="absolute inset-x-1.5 bottom-0 h-[3px] rounded-t-full bg-[hsl(var(--status))]" />}
      </button>;
    })}
  </div>;
}

export const queueTabLabelId = tabId;

function RowThumb({ src }: { src: string }) {
  const source = src?.trim();
  const [failed, setFailed] = useState("");
  return <span data-row-art className="relative block h-[76px] w-[76px] shrink-0 overflow-hidden rounded-xl bg-muted shadow-sm ring-1 ring-black/5 dark:ring-white/10 sm:h-[88px] sm:w-[128px]">
    {source && failed !== source ? <img src={source} alt="" loading="lazy" decoding="async" onError={() => setFailed(source)} className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover/row:scale-105 motion-reduce:transition-none motion-reduce:group-hover/row:scale-100" /> : <span className="flex h-full w-full items-center justify-center text-muted-foreground"><ImageOff className="h-5 w-5" aria-hidden="true" /></span>}
  </span>;
}

type RowProps = {
  event: Evento;
  index: number;
  now: Date;
  selected: boolean;
  checked: boolean;
  disabled: boolean;
  entrance: boolean;
  layoutTick: number;
  successLabel?: string;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  onRequestCorrection: (event: Evento) => void;
  onDelete: (event: Evento) => void;
};

export const QueueRow = memo(function QueueRow({ event, index, now, selected, checked, disabled, entrance, layoutTick, successLabel, onOpen, onToggle, onRequestCorrection, onDelete }: RowProps) {
  const reduced = useReducedMotion();
  // CSS entrance, fixed at mount: rows must stay visible even if the lazy motion features are late or fail to load.
  const [enter] = useState(entrance);
  const status = effectiveStatus(event);
  const pending = status === "PENDING";
  const problems = reviewProblems(event, now).length;
  const menu = [
    ...(pending ? [{ key: "correction", label: "Pedir correção" }] : []),
    ...(event.validate ? [{ key: "open", label: "Abrir página do evento", href: `/eventos/${event.id}` }] : []),
    { key: "delete", label: "Excluir evento" },
  ];
  // A row slides out only when its id is in the confirmed set passed through AnimatePresence `custom`.
  const variants = { exit: (confirmed: ReadonlySet<string> | undefined) => !reduced && confirmed?.has(event.id) ? { opacity: 0, x: -28, transition: { duration: 0.24, ease: reviewEase } } : { opacity: 0, transition: { duration: 0 } } };
  return <m.li layout={reduced ? false : "position"} layoutDependency={layoutTick} variants={variants} initial={false} animate={{ opacity: 1, x: 0 }} exit="exit" transition={{ duration: 0.3, ease: reviewEase, layout: reviewSpring }} style={enter ? { animationDelay: `${Math.min(index, 7) * 35}ms` } : undefined} className={cn(statusAccent[status], enter && !reduced && "duration-300 animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards motion-reduce:animate-none", "group/row relative flex items-start gap-0.5 py-2 pl-1 pr-1 before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[hsl(var(--status)/0.5)] sm:gap-1 sm:px-2")}>
    {selected && <m.span layoutId="admin-review-row-selection" transition={reviewSpring} aria-hidden="true" className="absolute inset-0 bg-[hsl(var(--status)/0.09)] shadow-[inset_3px_0_0_hsl(var(--status))]" />}
    <label className="relative flex size-11 shrink-0 cursor-pointer items-center justify-center">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={() => onToggle(event.id)} aria-label={`Selecionar ${event.nome}`} className="size-4 rounded accent-[hsl(var(--primary))]" />
    </label>
    <button type="button" data-queue-row={event.id} aria-current={selected ? "true" : undefined} onClick={() => onOpen(event.id)} className="relative flex min-w-0 flex-1 gap-3 rounded-xl p-1 text-left transition-[background-color,transform] duration-150 hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.995] motion-reduce:transform-none motion-reduce:transition-none">
      <RowThumb src={event.banner} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold leading-snug tracking-tight">{event.nome}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{organizerOf(event)} · <span className="font-medium text-foreground/80">{formatPrice(event)}</span>{event.category ? ` · ${event.category}` : ""}</span>
        <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3 shrink-0" aria-hidden="true" />{formatSchedule(event)}</span>
          <span className="inline-flex min-w-0 max-w-full items-center gap-1"><MapPin className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{event.endereco || "Sem endereço"}</span></span>
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <EventStatusBadge status={status} className="min-h-6 px-2 py-0.5" />
          {event.aiImport && <span className="inline-flex min-h-6 items-center rounded-full border border-border px-2 text-xs font-medium text-muted-foreground">{importedBadge(event.aiImport.sourceUrl)}</span>}
          {problems > 0 && <span className="inline-flex min-h-6 items-center gap-1 rounded-full border border-amber-600/25 bg-amber-500/10 px-2 text-xs font-medium text-amber-900 dark:text-amber-300"><AlertTriangle className="h-3 w-3" aria-hidden="true" />{problems} a conferir</span>}
          {successLabel ? <m.span initial={reduced ? false : { opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={reviewSpring} className="ml-auto inline-flex min-h-6 items-center gap-1 rounded-full bg-cta px-2 text-xs font-semibold text-cta-foreground"><Check className="h-3 w-3" aria-hidden="true" />{successLabel}</m.span> : <span className="ml-auto inline-flex items-center text-xs font-semibold text-brand">{pending ? "Revisar" : "Ver"}<ChevronRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover/row:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover/row:translate-x-0" aria-hidden="true" /></span>}
        </span>
      </span>
    </button>
    <Dropdown placement="bottom-end">
      <DropdownTrigger><HeroButton isIconOnly variant="light" aria-label={`Mais ações para ${event.nome}`} className="relative size-11 min-w-11 shrink-0"><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></HeroButton></DropdownTrigger>
      <DropdownMenu aria-label={`Ações para ${event.nome}`} items={menu} onAction={key => { if (key === "correction") onRequestCorrection(event); if (key === "delete") onDelete(event); }}>
        {item => <DropdownItem key={item.key} href={item.href} color={item.key === "delete" ? "danger" : "default"} className={cn("min-h-11", item.key === "delete" && "text-danger")}>{item.label}</DropdownItem>}
      </DropdownMenu>
    </Dropdown>
  </m.li>;
});

/** Single, one-shot celebration for a cleared queue. */
export function QueueClearedMark() {
  return <span className="relative mb-1 flex size-16 items-center justify-center">
    <span className="relative flex size-14 items-center justify-center rounded-full bg-cta text-cta-foreground shadow-[0_10px_24px_-10px_hsl(var(--cta))] duration-500 animate-in fade-in zoom-in-50 motion-reduce:animate-none"><Check className="h-7 w-7" strokeWidth={2.75} aria-hidden="true" /></span>
  </span>;
}
