import EventChatHub from "@/components/MyComponents/EventChatHub";

export default function EventChatPage({ params }: { params: { id: string } }) {
  return <EventChatHub eventId={params.id} />;
}
