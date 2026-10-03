import CommunityEventHub from "@/components/MyComponents/CommunityEventHub";

export default function EventCommunityPage({ params }: { params: { id: string } }) {
  return <CommunityEventHub eventId={params.id} />;
}
