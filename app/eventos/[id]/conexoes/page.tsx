import PartyConnectionsHub from "@/components/MyComponents/PartyConnectionsHub";
export default function PartyConnectionsPage({ params }: { params: { id: string } }) { return <PartyConnectionsHub eventId={params.id} />; }
