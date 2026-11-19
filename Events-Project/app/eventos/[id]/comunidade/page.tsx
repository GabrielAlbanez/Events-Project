import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import CommunityEventHub from "@/components/MyComponents/CommunityEventHub";

export const dynamic = "force-dynamic";

/** Existence only: access rules (status, team) stay in the community API, which also serves unpublished events to the team. */
async function eventExists(id: string): Promise<boolean | null> {
  if (!id || id.length > 100) return false;
  try {
    return Boolean(await prisma.events.findUnique({ where: { id }, select: { id: true } }));
  } catch {
    // Database unavailable: let the hub render its own retry state instead of a false 404.
    return null;
  }
}

export default async function EventCommunityPage({ params }: { params: { id: string } }) {
  if (await eventExists(params.id) === false) notFound();
  return <CommunityEventHub eventId={params.id} />;
}
