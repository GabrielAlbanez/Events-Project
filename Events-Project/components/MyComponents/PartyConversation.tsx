"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useEventChat } from "@/hooks/useEventChat";
import { usePartyConnections } from "@/hooks/usePartyConnections";
import { usePartyRealtime } from "@/hooks/usePartyRealtime";
import { useMatchPresence } from "@/hooks/useMatchPresence";
import { EventChatView } from "./EventChatHub";
import { PartySafetyActions } from "./PartyActions";

export default function PartyConversation({ eventId, matchId }: { eventId: string; matchId: string }) {
  const { data: session, status } = useSession();
  return <PartyConversationContent key={`${eventId}:${matchId}:${status}:${session?.user?.id ?? "guest"}:${session?.user?.role ?? ""}`} eventId={eventId} matchId={matchId} />;
}
function PartyConversationContent({ eventId, matchId }: { eventId: string; matchId: string }) {
  const resource = usePartyConnections(eventId);
  const chat = useEventChat(matchId, `/api/party-connections/${encodeURIComponent(eventId)}/matches/${encodeURIComponent(matchId)}`);
  const realtime = usePartyRealtime({ matchId }, chat.refresh, chat.revoke, !chat.denied);
  usePartyRealtime({ partyEventId: eventId }, resource.refresh, resource.revoke, !chat.denied);
  const partnerOnline = useMatchPresence(matchId, !chat.denied);
  const match = resource.data?.matches.find(item => item.id === matchId);
  const partner = match?.profile ?? (chat.event?.partnerId ? { userId: chat.event.partnerId, displayName: chat.event.name } : null);
  const { revoke } = chat;
  useEffect(() => { if (resource.data && (!resource.data.eligible || !resource.data.mine?.active)) revoke(); }, [resource.data, revoke]);
  const safety = async (payload: Record<string, unknown>) => { const ok = await resource.act(payload); if (ok && payload.action === "block") chat.revoke(); return ok; };
  return <><EventChatView eventId={eventId} chat={chat} realtime={realtime} privateMode selectedConversation={matchId} conversationsLoading={resource.loading} partnerOnline={partnerOnline} conversations={(resource.data?.matches ?? []).slice().sort((a, b) => new Date(b.lastMessage?.createdAt ?? b.createdAt ?? 0).getTime() - new Date(a.lastMessage?.createdAt ?? a.createdAt ?? 0).getTime()).map(item => ({ id: item.id, name: item.profile.displayName, image: item.profile.photoUrl, href: `/eventos/${encodeURIComponent(eventId)}/conexoes/${encodeURIComponent(item.id)}`, unreadCount: item.unreadCount, preview: item.lastMessage ? `${item.lastMessage.own ? "Você: " : ""}${item.lastMessage.text || "Foto"}` : undefined, createdAt: item.lastMessage?.createdAt ?? item.createdAt }))} />{partner && !chat.denied && <details className="mx-auto mb-6 max-w-6xl rounded-2xl border bg-card p-4"><summary className="cursor-pointer text-sm font-semibold">Sua segurança na conversa</summary><div className="mt-3"><PartySafetyActions key={resource.identity + partner.userId} userId={partner.userId} displayName={partner.displayName} busy={resource.busy || !resource.online} act={safety} messageIds={chat.messages.filter(message => !message.own).map(message => message.id)} />{resource.message && <p role="status" className="mt-3 text-sm">{resource.message}</p>}</div></details>}</>;
}
