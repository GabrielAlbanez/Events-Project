import type { Prisma } from "@prisma/client";
type EventAudience = { id: string; nome: string; userId: string | null; status?: string };
export async function notifyEventAudience(tx: Prisma.TransactionClient, event: EventAudience, notice: { title: string; message: string; includeFollowers?: boolean; includeAdmins?: boolean; includeFavorites?: boolean }) {
  const publicStatus = ["PUBLISHED", "CANCELLED", "ENDED"].includes(event.status ?? "");
  const recipients = new Map<string, string>();
  const publicHref = "/eventos/" + event.id;
  if (event.userId) recipients.set(event.userId, "/myEvents");
  if (notice.includeFavorites ?? publicStatus) {
    const favorites = await tx.favorite.findMany({where:{eventId:event.id},select:{userId:true}});
    for (const favorite of favorites) recipients.set(favorite.userId, publicHref);
  }
  if (notice.includeFollowers && event.userId && publicStatus) {
    const follows = await tx.follow.findMany({where:{promoterId:event.userId},select:{userId:true}});
    for (const follow of follows) recipients.set(follow.userId, publicHref);
  }
  if (notice.includeAdmins) {
    const admins = await tx.user.findMany({where:{role:"ADMIN"},select:{id:true}});
    for (const admin of admins) recipients.set(admin.id, "/EventsCreated");
  }
  if (recipients.size) await tx.notification.createMany({data:Array.from(recipients,([userId,href])=>({userId,href,title:notice.title.slice(0,150),message:notice.message.slice(0,2000)}))});
}
