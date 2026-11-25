"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, Heart, MessageCircleHeart, MessagesSquare, Search, WifiOff, X } from "lucide-react";
import { usePartyInbox, type PartyInboxResource } from "@/hooks/usePartyInbox";
import { conversationHref, filterInbox, formatActivity, formatEventDay, inboxEvents, inboxPreview, matchBadgeLabel } from "@/utils/partyInbox";
import { ChatAvatar } from "./ChatAvatar";
import PushSettings from "./PushSettings";
import styles from "./chat/Chat.module.css";

const chip = "inline-flex min-h-11 shrink-0 snap-start items-center rounded-full border px-4 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none";

/** The global conversation list, shared by /conversas and the conversation sidebar. */
export function PartyInbox({ inbox, selectedId, heading = "h2", prompt }: { inbox: PartyInboxResource; selectedId?: string; heading?: "h1" | "h2"; prompt?: ReactNode }) {
  const [query, setQuery] = useState("");
  const [eventId, setEventId] = useState<string | null>(null);
  const events = inboxEvents(inbox.items);
  const activeEvent = events.some(event => event.id === eventId) ? eventId : null;
  const visible = filterInbox(inbox.items, query, activeEvent);
  const Heading = heading;
  const filtered = !!query.trim() || !!activeEvent;
  return <aside className={`${styles.list} flex flex-col`} aria-label="Lista de conversas">
    <div className={styles.listHeading}>
      <div className="flex min-w-0 items-center gap-2"><Heading className="text-lg font-semibold tracking-[-0.03em]">Conversas</Heading>{inbox.unreadTotal > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold tabular-nums text-primary-foreground" aria-hidden="true">{inbox.unreadTotal > 99 ? "99+" : inbox.unreadTotal}</span>}</div>
      <MessagesSquare size={22} aria-hidden="true" />
      <span className="sr-only" aria-live="polite" aria-atomic="true">{inbox.loading ? "" : `${inbox.unreadTotal} ${inbox.unreadTotal === 1 ? "mensagem não lida" : "mensagens não lidas"}`}</span>
    </div>
    {prompt}
    {inbox.items.length > 0 && <>
      <div className={styles.search}><Search size={18} aria-hidden="true" /><input type="search" aria-label="Buscar por nome ou evento" placeholder="Buscar por nome ou evento" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca" className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><X size={16} aria-hidden="true" /></button>}</div>
      {events.length > 1 && <div role="group" aria-label="Filtrar por evento" className="-mt-1 flex min-w-0 snap-x scroll-px-3 gap-2 overflow-x-auto px-3 pb-3 [scrollbar-width:none]">
        <button type="button" aria-pressed={!activeEvent} onClick={() => setEventId(null)} className={`${chip} ${!activeEvent ? "border-cta bg-cta text-cta-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}>Todos</button>
        {events.map(event => <button key={event.id} type="button" aria-pressed={activeEvent === event.id} onClick={() => setEventId(event.id)} className={`${chip} max-w-[220px] ${activeEvent === event.id ? "border-cta bg-cta text-cta-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}><span className="truncate">{event.name}</span></button>)}
      </div>}
    </>}
    {!inbox.online && <p role="status" className={`${styles.notice} ${styles.noticeWarn} mx-3 mb-2 rounded-[14px] border`}><WifiOff size={16} aria-hidden="true" /><span>Sem conexão. Mostrando a última lista carregada.</span></p>}
    {inbox.error && <div role="alert" className={`${styles.notice} ${styles.noticeError} mx-3 mb-2 rounded-[14px] border`}><AlertCircle size={16} aria-hidden="true" /><span>{inbox.error}</span><button type="button" disabled={inbox.refreshing || !inbox.online} onClick={() => void inbox.refresh()} className="min-h-11 font-semibold text-brand underline-offset-4 hover:underline disabled:opacity-50">Tentar novamente</button></div>}
    <nav aria-label="Conversas" aria-busy={inbox.loading} className="min-h-0 flex-1 pb-3">
      {inbox.loading ? <div role="status" className="grid gap-2 px-3 pt-1">{[0, 1, 2, 3].map(index => <div key={index} className="flex items-center gap-3 rounded-2xl p-3"><span className="size-12 shrink-0 rounded-full bg-muted motion-safe:animate-pulse" /><span className="grid flex-1 gap-2"><span className="h-3.5 w-2/5 rounded bg-muted motion-safe:animate-pulse" /><span className="h-3 w-3/5 rounded bg-muted motion-safe:animate-pulse" /><span className="h-3 w-4/5 rounded bg-muted motion-safe:animate-pulse" /></span></div>)}<span className="sr-only">Carregando conversas…</span></div>
        : inbox.items.length === 0 ? (!inbox.error && <div className="mx-auto grid max-w-xs justify-items-center gap-2 px-5 py-10 text-center"><span className="mb-1 grid size-14 place-items-center rounded-[20px] bg-primary/10 text-brand"><Heart size={26} aria-hidden="true" /></span><p className="text-base font-semibold tracking-[-0.02em]">Você ainda não tem conversas</p><p className="text-sm leading-6 text-muted-foreground">Participe das conexões de um evento. Quando o interesse for mútuo, a conversa aparece aqui.</p><Link href="/EventsCreated" className="mt-2 inline-flex min-h-11 items-center rounded-full bg-cta px-5 text-sm font-semibold text-cta-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Descobrir eventos →</Link></div>)
          : visible.length === 0 ? <div className="grid justify-items-center gap-2 px-5 py-8 text-center text-sm text-muted-foreground"><p>Nenhuma conversa encontrada{filtered ? " com esses filtros" : ""}.</p><button type="button" onClick={() => { setQuery(""); setEventId(null); }} className="min-h-11 rounded-full px-4 font-semibold text-brand hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Limpar filtros</button></div>
            : <ul className="min-w-0 space-y-0.5">{visible.map(item => {
              const selected = selectedId === item.id, unread = item.unreadCount ?? 0, activity = item.lastMessage?.createdAt ?? item.createdAt;
              return <li key={item.id}><Link href={conversationHref(item.id)} aria-current={selected ? "page" : undefined} className={`${styles.listItem} ${selected ? styles.selected : ""} ${unread ? styles.unreadItem : ""} !items-start`}>
                <ChatAvatar name={item.profile.displayName} image={item.profile.photoUrl || null} className="mt-0.5 size-12 text-sm" />
                <div className={styles.listIdentity}>
                  <div><strong>{item.profile.displayName}</strong>{activity && <time dateTime={activity}>{formatActivity(activity)}</time>}</div>
                  <span className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-cta/20 px-2 py-0.5 text-[11px] font-semibold text-foreground dark:bg-cta/15"><Heart size={11} className="shrink-0 fill-current text-brand" aria-hidden="true" /><span className="truncate">{matchBadgeLabel(item.event)}</span></span>
                  <div><p>{inboxPreview(item)}</p>{unread > 0 && <span className={styles.badge} aria-label={`${unread} ${unread === 1 ? "mensagem não lida" : "mensagens não lidas"}`}>{unread > 99 ? "99+" : unread}</span>}</div>
                </div>
              </Link></li>;
            })}</ul>}
    </nav>
  </aside>;
}

/** Event where the match happened, linking back to the event page. */
export function MatchEventBadge({ event }: { event: { id: string; name: string; date?: string } }) {
  const day = formatEventDay(event.date);
  return <Link href={`/eventos/${encodeURIComponent(event.id)}`} className="inline-flex max-w-full items-center gap-1 rounded-full text-xs text-muted-foreground hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><Heart size={11} className="shrink-0 fill-current text-brand" aria-hidden="true" /><span className="truncate"><span className="sm:hidden">Match em </span><span className="hidden sm:inline">Vocês deram match em </span><strong className="font-semibold text-foreground">{event.name}</strong>{day ? ` · ${day}` : ""}</span></Link>;
}

/** /conversas: the list, with an empty reading pane on desktop. On phones the list is the whole screen. */
export default function PartyInboxScreen() {
  const inbox = usePartyInbox();
  return <div className={styles.page}>
    <section className={`${styles.shell} ${styles.listOpen}`} aria-label="Conversas">
      <PartyInbox inbox={inbox} heading="h1" prompt={<PushSettings variant="compact" />} />
      <section className={styles.conversation} aria-label="Nenhuma conversa aberta">
        <div className={styles.emptyState}><span className={styles.emptyIcon}><MessageCircleHeart size={26} aria-hidden="true" /></span><h2>Escolha uma conversa</h2><p>Todas as suas conversas de match ficam aqui, de todos os eventos. Cada uma mostra onde vocês se conheceram.</p></div>
      </section>
    </section>
  </div>;
}
