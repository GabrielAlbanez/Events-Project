import PartyConversation from "@/components/MyComponents/PartyConversation";
export default function PartyConversationPage({ params }: { params: { id: string; matchId: string } }) { return <PartyConversation eventId={params.id} matchId={params.matchId} />; }
