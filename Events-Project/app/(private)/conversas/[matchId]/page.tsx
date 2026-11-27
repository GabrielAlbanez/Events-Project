import type { Metadata } from "next";
import PartyConversation from "@/components/MyComponents/PartyConversation";
export const metadata: Metadata = { title: "Conversa" };
export default function ConversationPage({ params }: { params: { matchId: string } }) { return <PartyConversation source="inbox" matchId={params.matchId} />; }
