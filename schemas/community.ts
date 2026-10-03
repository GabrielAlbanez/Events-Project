import { z } from "zod";
const id = z.string().uuid();
const text = z.string().trim().min(1).max(1000);
const title = z.string().trim().min(1).max(160);
export const communityActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("announcement.publish"), title, message: text }),
  z.object({ action: z.literal("announcement.archive"), id }),
  z.object({ action: z.literal("question.ask"), text }),
  z.object({ action: z.literal("question.answer"), id, answer: text, highlighted: z.boolean().default(false) }),
  z.object({ action: z.literal("poll.create"), title, options: z.array(z.string().trim().min(1).max(120)).min(2).max(8).refine(values => new Set(values).size === values.length) }),
  z.object({ action: z.literal("poll.vote"), id, option: z.number().int().min(0).max(7) }),
  z.object({ action: z.literal("poll.close"), id }),
  z.object({ action: z.literal("program.save"), title, startsAt: z.string().datetime({ offset: true }) }),
  z.object({ action: z.literal("program.update"), id, title, startsAt: z.string().datetime({ offset: true }) }),
  z.object({ action: z.literal("program.status"), id, status: z.enum(["UPCOMING", "LIVE", "DONE"]) }),
  z.object({ action: z.literal("queue.create"), title }),
  z.object({ action: z.literal("queue.join"), id }),
  z.object({ action: z.literal("queue.leave"), id }),
  z.object({ action: z.literal("queue.next"), id }),
  z.object({ action: z.literal("queue.control"), id, state: z.enum(["OPEN", "PAUSED", "CLOSED"]) }),
  z.object({ action: z.literal("team.add"), email: z.string().email().max(254) }),
  z.object({ action: z.literal("team.remove"), userId: id }),
  z.object({ action: z.literal("task.create"), title, assignedTo: id.optional() }),
  z.object({ action: z.literal("task.update"), id, status: z.enum(["TODO", "DONE", "HELP"]) }),
  z.object({ action: z.literal("lost.create"), title, description: text }),
  z.object({ action: z.literal("lost.claim"), id, message: text }),
  z.object({ action: z.literal("lost.resolve"), claimId: id }),
  z.object({ action: z.literal("feedback.save"), rating: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).default("") }),
]);
export type CommunityAction = z.infer<typeof communityActionSchema>;
