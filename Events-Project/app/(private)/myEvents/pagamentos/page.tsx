import type { Metadata } from "next";
import PaymentsPanel from "@/components/MyComponents/tickets/PaymentsPanel";

export const metadata: Metadata = { title: "Pagamentos" };
export const dynamic = "force-dynamic";

export default function PaymentsPage({ searchParams }: { searchParams: { status?: string | string[] } }) {
  const status = typeof searchParams.status === "string" ? searchParams.status : undefined;
  return <PaymentsPanel connectStatus={status} />;
}
