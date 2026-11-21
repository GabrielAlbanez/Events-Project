"use client";

import Link from "next/link";
import { Bell, CalendarClock, CalendarDays, Check, CheckCheck, Clock3, Heart, Info, ShieldCheck, TicketCheck, Users, type LucideIcon } from "lucide-react";
import type { NotificationDTO } from "@/types/features";
import { getNotificationType, notificationCatalog, safeNotificationHref } from "@/lib/notifications/catalog";

const icons: Record<string, LucideIcon> = { Bell, CalendarClock, CalendarDays, Check, CheckCheck, Clock3, Heart, Info, ShieldCheck, TicketCheck, Users };
const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" });

export function NotificationIcon({ item }: { item: Pick<NotificationDTO, "type"> }) {
  const definition = notificationCatalog[getNotificationType(item.type)];
  const Icon = icons[definition.icon] ?? Bell;
  return <span className={`grid size-10 shrink-0 place-items-center rounded-2xl ${definition.className}`}><Icon className="size-[18px]" aria-hidden="true" /></span>;
}

export function relativeNotificationTime(value: string, now = Date.now()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Agora";
  const minutes = Math.max(0, Math.floor((now - date.getTime()) / 60000));
  if (minutes < 1) return "Agora";
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 1440) return `há ${Math.floor(minutes / 60)} h`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function groupNotifications(items: NotificationDTO[], now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const groups: { label: string; items: NotificationDTO[] }[] = ["Hoje", "Ontem", "Anteriores"].map(label => ({ label, items: [] }));
  for (const item of items) {
    const time = new Date(item.createdAt).getTime();
    groups[time >= today.getTime() ? 0 : time >= yesterday.getTime() ? 1 : 2].items.push(item);
  }
  return groups.filter(group => group.items.length);
}

export function NotificationSkeleton({ compact = false }: { compact?: boolean }) {
  return <div role="status" aria-label="Carregando notificações" className="space-y-2"><span className="sr-only">Carregando notificações</span>{[0, 1, 2].map(index => <div key={index} aria-hidden="true" className={`flex gap-3 rounded-2xl ${compact ? "p-3" : "p-5"}`}><span className="size-10 shrink-0 rounded-2xl bg-muted motion-safe:animate-pulse" /><div className="flex-1 space-y-3 py-1"><div className="h-3 w-2/3 rounded bg-muted motion-safe:animate-pulse" /><div className="h-3 w-full rounded bg-muted motion-safe:animate-pulse" /><div className="h-3 w-1/3 rounded bg-muted motion-safe:animate-pulse" /></div></div>)}</div>;
}

export function NotificationEmpty({ filtered = false }: { filtered?: boolean }) {
  return <div className="px-6 py-12 text-center"><span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-primary/10 text-brand"><CheckCheck className="size-5" aria-hidden="true" /></span><h2 className="text-base font-semibold">{filtered ? "Tudo em dia por aqui" : "Seu próximo aviso chega por aqui"}</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{filtered ? "Não há notificações para este filtro. Você pode conferir as outras categorias." : "Mudanças nos eventos, lembretes e novas conexões ficam reunidos neste espaço."}</p></div>;
}

export function NotificationList({ items, compact = false, busy = false, onRead, onOpen }: {
  items: NotificationDTO[]; compact?: boolean; busy?: boolean;
  onRead: (item: NotificationDTO) => void; onOpen?: () => void;
}) {
  return <div className="space-y-5">{groupNotifications(items).map(group => <section key={group.label} aria-label={group.label}><h2 className={`mb-2 text-xs font-semibold text-muted-foreground ${compact ? "px-3" : "px-1"}`}>{group.label}</h2><ol className="space-y-2">{group.items.map(item => <li key={item.id} className={`relative rounded-2xl border transition-colors motion-reduce:transition-none ${item.readAt ? "border-transparent bg-card" : "border-primary/15 bg-primary/[0.035]"} ${item.priority === "high" ? "border-l-[3px] border-l-primary" : ""}`}><div className={`flex items-start gap-3 ${compact ? "p-3" : "p-4 sm:p-5"}`}><NotificationIcon item={item} /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><h3 className="min-w-0 break-words text-sm font-semibold leading-6">{item.title}</h3>{!item.readAt && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary"><span className="sr-only">Não lida</span></span>}</div><p className={`mt-1 break-words text-sm leading-6 text-muted-foreground ${compact ? "line-clamp-2" : "whitespace-pre-wrap"}`}>{item.message}</p><time dateTime={item.createdAt} title={Number.isFinite(Date.parse(item.createdAt)) ? dateFormat.format(new Date(item.createdAt)) : undefined} className="mt-2 block text-xs text-muted-foreground">{relativeNotificationTime(item.createdAt)}</time><div className="mt-1 flex flex-wrap items-center gap-x-4"><Link href={safeNotificationHref(item.href)} onClick={() => { if (!item.readAt) onRead(item); onOpen?.(); }} className="inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Ver detalhes<span className="sr-only">: {item.title}</span></Link>{!item.readAt && <button type="button" disabled={busy} onClick={() => onRead(item)} className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"><Check className="size-3.5" aria-hidden="true" />Marcar como lida<span className="sr-only">: {item.title}</span></button>}</div></div></div></li>)}</ol></section>)}</div>;
}
