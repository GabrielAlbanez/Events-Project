import { CommunityAction } from "@/schemas/community";
import { CommunityError } from "./common";
import { CommunityEntries } from "./entries";

export async function handleAnnouncement(action: CommunityAction, entries: CommunityEntries, manage: boolean): Promise<boolean> {
  if (action.action !== "announcement.publish" && action.action !== "announcement.archive") return false;
  if (!manage) throw new CommunityError(403, "Somente a organização pode publicar comunicados.");
  if (action.action === "announcement.publish") await entries.create("announcement", { title: action.title, message: action.message, archived: false });
  else await entries.update(action.id, "announcement", { archived: true });
  return true;
}
