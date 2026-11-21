"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useEventChat } from "@/hooks/useEventChat";
import { usePartyConnections } from "@/hooks/usePartyConnections";
import { usePartyRealtime } from "@/hooks/usePartyRealtime";
import { useMatchPresence } from "@/hooks/useMatchPresence";
import { EventChatView } from "./EventChatHub";
import { PartySafetyActions } from "./PartyActions";
import { COMMUNITY_SAVED_MESSAGE } from "./CommunityResource";
import { useToastMessage } from "@/hooks/useToastMessage";

export default function PartyConversation({ eventId, matchId }: { eventId: string; matchId: string }) {
  const { data: session, status } = useSession();
  return <PartyConversationContent key={`${eventId}:${matchId}:${status}:${session?.user?.id ?? "guest"}:${session?.user?.role ?? ""}`} eventId={eventId} matchId={matchId} />;
}
function PartyConversationContent({ eventId, matchId }: { eventId: string; matchId: string }) {
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
  const safety = async (payload: Record<string, unknown>) => { const ok = await resource.act(payload); if (ok && payload.action === "block") chat.revoke(); return ok; };
  return <EventChatView eventId={eventId} chat={chat} realtime={realtime} privateMode selectedConversation={matchId} conversationsLoading={resource.loading} partnerOnline={partnerOnline} headerAction={partner && !chat.denied ? <Dialog><DialogTrigger asChild><button type="button" aria-label="Segurança na conversa" title="Segurança na conversa" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ShieldCheck size={20} aria-hidden="true" /></button></DialogTrigger><DialogContent className="max-w-[calc(100%_-_2rem)] rounded-2xl sm:max-w-md"><DialogTitle>Sua segurança na conversa</DialogTitle><DialogDescription>Se algo não parecer certo, bloqueie ou denuncie {partner.displayName}. Quem você bloqueia deixa de ver você e de enviar mensagens.</DialogDescription><PartySafetyActions key={resource.identity + partner.userId} userId={partner.userId} displayName={partner.displayName} busy={resource.busy || !resource.online} act={safety} messageIds={chat.messages.filter(message => !message.own).map(message => message.id)} /></DialogContent></Dialog> : undefined} conversations={(resource.data?.matches ?? []).slice().sort((a, b) => new Date(b.lastMessage?.createdAt ?? b.createdAt ?? 0).getTime() - new Date(a.lastMessage?.createdAt ?? a.createdAt ?? 0).getTime()).map(item => ({ id: item.id, name: item.profile.displayName, image: item.profile.photoUrl, href: `/eventos/${encodeURIComponent(eventId)}/conexoes/${encodeURIComponent(item.id)}`, unreadCount: item.unreadCount, preview: item.lastMessage ? `${item.lastMessage.own ? "Você: " : ""}${item.lastMessage.text || "Foto"}` : undefined, createdAt: item.lastMessage?.createdAt ?? item.createdAt }))} />;
}
