import type { Metadata } from "next";
import PromoteEventPanel from "@/components/MyComponents/promotions/PromoteEventPanel";

export const metadata: Metadata = { title: "Destacar evento" };

export default function PromoteEventPage({ params }: { params: { id: string } }) {
  return <PromoteEventPanel eventId={params.id} />;
}
