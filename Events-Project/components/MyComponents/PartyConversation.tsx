"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowLeft, MessageCircleOff, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useEventChat } from "@/hooks/useEventChat";
import { usePartyConnections } from "@/hooks/usePartyConnections";
import { usePartyInbox, type PartyInboxResource } from "@/hooks/usePartyInbox";
import { usePartyRealtime } from "@/hooks/usePartyRealtime";
import { useMatchPresence } from "@/hooks/useMatchPresence";
import { EventChatView } from "./EventChatHub";
import { PartySafetyActions } from "./PartyActions";
import { MatchEventBadge, PartyInbox } from "./PartyInbox";
import { COMMUNITY_SAVED_MESSAGE } from "./CommunityResource";
import { useToastMessage } from "@/hooks/useToastMessage";
import styles from "./chat/Chat.module.css";

type ConversationProps = { matchId: string } & ({ source?: "event"; eventId: string } | { source: "inbox"; eventId?: never });

export default function PartyConversation(props: ConversationProps) {
  const { data: session, status } = useSession();
  const key = `${props.eventId ?? "inbox"}:${props.matchId}:${status}:${session?.user?.id ?? "guest"}:${session?.user?.role ?? ""}`;
  return props.source === "inbox" ? <InboxConversation key={key} matchId={props.matchId} /> : <PartyConversationContent key={key} eventId={props.eventId} matchId={props.matchId} />;
}

/** /conversas/[matchId]: the event comes from the global list, so the chat waits for it. */
function InboxConversation({ matchId }: { matchId: string }) {
  const inbox = usePartyInbox();
  const item = inbox.items.find(entry => entry.id === matchId);
  if (item) return <PartyConversationContent eventId={item.event.id} matchId={matchId} inbox={inbox} />;
  return <div className={styles.page}>
    <div className={`${styles.toolbar} ${styles.toolbarMobileOnly}`}><Link href="/conversas" className="inline-flex items-center gap-2"><ArrowLeft size={15} aria-hidden="true" />Conversas</Link></div>
    <section className={`${styles.shell} ${styles.conversationOpen}`} aria-label="Chat">
      <PartyInbox inbox={inbox} selectedId={matchId} />
      <section className={styles.conversation} aria-label="Conversa">
        {inbox.loading ? <div role="status" className={`${styles.skeleton} p-6`}><span /><span /><span /><span /><p className="sr-only">Buscando sua conversa…</p></div>
          : <div className={styles.emptyState}><span className={styles.emptyIcon}><MessageCircleOff size={26} aria-hidden="true" /></span><h1 className="text-lg font-semibold tracking-[-0.02em] text-foreground">{inbox.error ? "Não foi possível abrir a conversa" : "Conversa indisponível"}</h1><p>{inbox.error ? "Confira sua conexão e tente novamente." : "Ela pode ter sido encerrada, ou a participação no evento mudou."}</p>{inbox.error ? <button type="button" onClick={() => void inbox.refresh()} disabled={!inbox.online || inbox.refreshing} className={styles.emptyAction}>Tentar novamente</button> : <Link href="/conversas" className={styles.emptyAction}>Ver todas as conversas</Link>}</div>}
      </section>
    </section>
  </div>;
}

function PartyConversationContent({ eventId, matchId, inbox }: { eventId: string; matchId: string; inbox?: PartyInboxResource }) {
  const resource = usePartyConnections(eventId);
  useToastMessage(resource.message, resource.message === COMMUNITY_SAVED_MESSAGE ? "success" : "error");
  const chat = useEventChat(matchId, `/api/party-connections/${encodeURIComponent(eventId)}/matches/${encodeURIComponent(matchId)}`);
  const realtime = usePartyRealtime({ matchId }, chat.refresh, chat.revoke, !chat.denied);
  usePartyRealtime({ partyEventId: eventId }, resource.refresh, resource.revoke, !chat.denied);
  const partnerOnline = useMatchPresence(matchId, !chat.denied);
  const match = resource.data?.matches.find(item => item.id === matchId);
  const partner = match?.profile ?? (chat.event?.partnerId ? { userId: chat.event.partnerId, displayName: chat.event.name } : null);
  const { revoke } = chat;
  useEffect(() => { if (resource.data && (!resource.data.eligible || !resource.data.mine?.active)) revoke(); }, [resource.data, revoke]);
  // Sent and received messages refresh the preview and unread count of the global list.
  const refreshInbox = inbox?.refresh;
  const newest = chat.messages.at(-1)?.id;
  useEffect(() => { if (newest !== undefined) void refreshInbox?.(); }, [newest, refreshInbox]);
  // Reading clears the unread badge even when the personal socket signal is unavailable.
  const { acknowledge } = chat;
  const syncedRead = useRef(0);
  const syncTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(syncTimer.current), []);
  const acknowledgeAndSync = useCallback((messageId: number, read: boolean) => {
    acknowledge(messageId, read);
    if (!read || !refreshInbox || messageId <= syncedRead.current) return;
    syncedRead.current = messageId;
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => void refreshInbox(), 1200);
  }, [acknowledge, refreshInbox]);
  const chatView = inbox ? { ...chat, acknowledge: acknowledgeAndSync } : chat;
  const safety = async (payload: Record<string, unknown>) => { const ok = await resource.act(payload); if (ok && payload.action === "block") { chat.revoke(); void refreshInbox?.(); } return ok; };
  const inboxEvent = inbox?.items.find(item => item.id === matchId)?.event;
  const event = inboxEvent ?? resource.data?.event ?? null;
  const headerAction = partner && !chat.denied ? <Dialog><DialogTrigger asChild><button type="button" aria-label="Segurança na conversa" title="Segurança na conversa" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ShieldCheck size={20} aria-hidden="true" /></button></DialogTrigger><DialogContent className="max-w-[calc(100%_-_2rem)] rounded-2xl sm:max-w-md"><DialogTitle>Sua segurança na conversa</DialogTitle><DialogDescription>Se algo não parecer certo, bloqueie ou denuncie {partner.displayName}. Quem você bloqueia deixa de ver você e de enviar mensagens.</DialogDescription><PartySafetyActions key={resource.identity + partner.userId} userId={partner.userId} displayName={partner.displayName} busy={resource.busy || !resource.online} act={safety} messageIds={chat.messages.filter(message => !message.own).map(message => message.id)} /></DialogContent></Dialog> : undefined;
  const headerBadge = event && !chat.denied ? <MatchEventBadge event={event} /> : undefined;
  if (inbox) return <EventChatView eventId={eventId} chat={chatView} realtime={realtime} privateMode selectedConversation={matchId} partnerOnline={partnerOnline} headerAction={headerAction} headerBadge={headerBadge} listSlot={<PartyInbox inbox={inbox} selectedId={matchId} />} backLink={{ href: "/conversas", label: "Conversas", mobileOnly: true }} />;
  return <EventChatView eventId={eventId} chat={chat} realtime={realtime} privateMode selectedConversation={matchId} conversationsLoading={resource.loading} partnerOnline={partnerOnline} headerAction={headerAction} headerBadge={headerBadge} conversations={(resource.data?.matches ?? []).slice().sort((a, b) => new Date(b.lastMessage?.createdAt ?? b.createdAt ?? 0).getTime() - new Date(a.lastMessage?.createdAt ?? a.createdAt ?? 0).getTime()).map(item => ({ id: item.id, name: item.profile.displayName, image: item.profile.photoUrl, href: `/eventos/${encodeURIComponent(eventId)}/conexoes/${encodeURIComponent(item.id)}`, unreadCount: item.unreadCount, preview: item.lastMessage ? `${item.lastMessage.own ? "Você: " : ""}${item.lastMessage.text || "Foto"}` : undefined, createdAt: item.lastMessage?.createdAt ?? item.createdAt }))} />;
}
