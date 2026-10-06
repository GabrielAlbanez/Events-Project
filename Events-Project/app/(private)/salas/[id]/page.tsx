import { CommunityRoom } from "@/components/MyComponents/CommunityRooms";

export default function RoomPage({ params }: { params: { id: string } }) {
  return <CommunityRoom roomId={params.id} />;
}
