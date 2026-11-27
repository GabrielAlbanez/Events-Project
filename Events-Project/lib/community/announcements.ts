import { Prisma } from "@prisma/client";
import { CommunityAction } from "@/schemas/community";
import { CommunityError } from "./common";
import { CommunityEntries } from "./entries";
import { notifyAnnouncementAudience } from "./notifications";

/** Official notices per event and hour when attendees are notified (OPP-07). */
export const announcementHourlyLimit = 3;

/** Optional so older callers keep the previous, silent behavior. */
export type AnnouncementContext = { tx: Prisma.TransactionClient; eventId: string; eventName: string; eventStatus: string; actorId: string };

export async function handleAnnouncement(action: CommunityAction, entries: CommunityEntries, manage: boolean, context?: AnnouncementContext): Promise<boolean> {
  if (action.action !== "announcement.publish" && action.action !== "announcement.archive") return false;
  if (!manage) throw new CommunityError(403, "Somente a organização pode publicar comunicados.");
  if (action.action === "announcement.publish") {
    if (context) {
      const since = new Date(Date.now() - 60 * 60 * 1000);
      const recent = await context.tx.communityEntry.count({ where: { eventId: context.eventId, kind: "announcement", createdAt: { gte: since } } });
      if (recent >= announcementHourlyLimit) throw new CommunityError(429, `Limite de ${announcementHourlyLimit} comunicados por hora atingido. Tente novamente mais tarde.`);
    }
    await entries.create("announcement", { title: action.title, message: action.message, archived: false });
    if (context?.eventStatus === "PUBLISHED") await notifyAnnouncementAudience(context.tx, context.eventId, context.eventName, action.title, context.actorId);
  }
  else await entries.update(action.id, "announcement", { archived: true });
  return true;
}
