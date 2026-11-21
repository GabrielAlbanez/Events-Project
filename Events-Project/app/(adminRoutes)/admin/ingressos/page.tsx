import type { Metadata } from "next";
import AdminTickets from "@/components/MyComponents/tickets/AdminTickets";

export const metadata: Metadata = { title: "Ingressos vendidos" };

export default function AdminTicketsPage() {
  return <AdminTickets />;
}
