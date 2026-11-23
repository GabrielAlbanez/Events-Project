"use client";

import { memo, useEffect, useRef, type KeyboardEvent } from "react";
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Button as HeroButton } from "@heroui/react";
import { AlertTriangle, CalendarDays, ChevronRight, ImageOff, MapPin, MoreHorizontal } from "lucide-react";
import { EventArtwork } from "@/components/MyComponents/EventArtwork";
import { EventStatusBadge } from "@/components/ui/status-badge";
import { importedBadge } from "@/lib/aiEvents/sources";
import { effectiveStatus, formatPrice, formatSchedule, organizerOf, queueTabs, reviewProblems, type QueueTab } from "@/lib/adminReviewQueue";
import { cn } from "@/lib/utils";
import type { Evento } from "@/types";

export const queuePanelId = "admin-review-queue-panel";
const tabId = (tab: QueueTab) => `admin-review-tab-${tab}`;

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
  return <div role="tablist" aria-label="Filas de revisão" onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]">
    {queueTabs.map(tab => {
      const selected = tab.id === active;
      return <button key={tab.id} ref={node => { refs.current[tab.id] = node; }} id={tabId(tab.id)} type="button" role="tab" aria-selected={selected} aria-controls={queuePanelId} tabIndex={selected ? 0 : -1} onClick={() => onChange(tab.id)} className={cn("-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none", selected ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
        {tab.label}
        <span className={cn("rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums", selected ? "bg-primary/10 text-brand" : "bg-muted text-muted-foreground")}>{counts[tab.id]}</span>
      </button>;
    })}
  </div>;
}

export const queueTabLabelId = tabId;

type RowProps = {
  event: Evento;
  now: Date;
  selected: boolean;
  checked: boolean;
  disabled: boolean;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  onRequestCorrection: (event: Evento) => void;
  onDelete: (event: Evento) => void;
};

export const QueueRow = memo(function QueueRow({ event, now, selected, checked, disabled, onOpen, onToggle, onRequestCorrection, onDelete }: RowProps) {
  const status = effectiveStatus(event);
  const pending = status === "PENDING";
  const problems = reviewProblems(event, now).length;
  const menu = [
    ...(pending ? [{ key: "correction", label: "Pedir correção" }] : []),
    ...(event.validate ? [{ key: "open", label: "Abrir página do evento", href: `/eventos/${event.id}` }] : []),
    { key: "delete", label: "Excluir evento" },
  ];
  return <li className={cn("flex items-start gap-0.5 py-1.5 pl-0.5 pr-1 sm:gap-1 sm:px-2", selected && "bg-muted/70 shadow-[inset_2px_0_0_hsl(var(--brand))]")}>
    <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={() => onToggle(event.id)} aria-label={`Selecionar ${event.nome}`} className="size-4 rounded accent-[hsl(var(--primary))]" />
    </label>
    <button type="button" data-queue-row={event.id} aria-current={selected ? "true" : undefined} onClick={() => onOpen(event.id)} className="flex min-w-0 flex-1 gap-3 rounded-lg p-1 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <EventArtwork src={event.banner} loading="lazy" className="size-14 shrink-0 rounded-lg bg-muted sm:size-16" fallback={<span className="flex h-full w-full items-center justify-center text-muted-foreground"><ImageOff className="h-4 w-4" aria-hidden="true" /></span>} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{event.nome}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{organizerOf(event)} · {formatPrice(event)}{event.category ? ` · ${event.category}` : ""}</span>
        <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3 shrink-0" aria-hidden="true" />{formatSchedule(event)}</span>
          <span className="inline-flex min-w-0 max-w-full items-center gap-1"><MapPin className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{event.endereco || "Sem endereço"}</span></span>
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <EventStatusBadge status={status} className="min-h-6 px-2 py-0.5" />
          {event.aiImport && <span className="inline-flex min-h-6 items-center rounded-full border border-border px-2 text-xs font-medium text-muted-foreground">{importedBadge(event.aiImport.sourceUrl)}</span>}
          {problems > 0 && <span className="inline-flex min-h-6 items-center gap-1 rounded-full border border-amber-600/25 bg-amber-500/10 px-2 text-xs font-medium text-amber-900 dark:text-amber-300"><AlertTriangle className="h-3 w-3" aria-hidden="true" />{problems} a conferir</span>}
          <span className="ml-auto inline-flex items-center text-xs font-semibold text-brand">{pending ? "Revisar" : "Ver"}<ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></span>
        </span>
      </span>
    </button>
    <Dropdown placement="bottom-end">
      <DropdownTrigger><HeroButton isIconOnly variant="light" aria-label={`Mais ações para ${event.nome}`} className="size-11 min-w-11 shrink-0"><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></HeroButton></DropdownTrigger>
      <DropdownMenu aria-label={`Ações para ${event.nome}`} items={menu} onAction={key => { if (key === "correction") onRequestCorrection(event); if (key === "delete") onDelete(event); }}>
        {item => <DropdownItem key={item.key} href={item.href} color={item.key === "delete" ? "danger" : "default"} className={cn("min-h-11", item.key === "delete" && "text-danger")}>{item.label}</DropdownItem>}
      </DropdownMenu>
    </Dropdown>
  </li>;
});
