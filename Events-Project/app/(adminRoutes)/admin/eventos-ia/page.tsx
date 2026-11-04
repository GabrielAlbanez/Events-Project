import { redirect } from "next/navigation";
import { getAuthenticatedAdminId } from "@/lib/adminAuth";
import AdminAiEvents from "@/components/MyComponents/AdminAiEvents";

export const dynamic = "force-dynamic";

export default async function AiEventsPage() {
  if (!await getAuthenticatedAdminId()) redirect("/");
  return <AdminAiEvents />;
}
