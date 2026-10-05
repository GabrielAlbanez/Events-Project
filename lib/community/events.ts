import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { eventInstant } from "@/lib/eventTime";
import { CommunityAction } from "@/schemas/community";
import { CommunityEventSnapshot } from "@/types/community";
import { Actor, CommunityError, signal, transact } from "./common";
import { entryData as data, textValue as string, textValues as strings } from "./json";
import { eventCommunityAccess as access } from "./access";
import { communityEntries } from "./entries";
import { handleAnnouncement } from "./announcements";
import { handleQueue, queueState } from "./queues";
import { notifyCommunityUser, notifyQuestionAnswer, notifyTaskHelp } from "./notifications";
async function feedbackEligible(db: Prisma.TransactionClient, event: Awaited<ReturnType<typeof access>>["event"], actor: Actor | null) {
  const end = eventInstant(event.dataFim, event.endTime, event.timezone, "23:59");
  if (!actor || !["PUBLISHED", "ENDED"].includes(event.status) || !end || end > new Date()) return false;
  const registration = await db.eventRegistration.findUnique({ where: { eventId_userId: { eventId: event.id, userId: actor.id } } });
  return !!registration && ["CONFIRMED", "CHECKED_IN"].includes(registration.status);
}
export async function eventSnapshot(eventId: string, actor: Actor | null): Promise<CommunityEventSnapshot> {
  return prisma.$transaction(async tx => {
  const { event, manage, team } = await access(tx, eventId, actor);
  const entries = await tx.communityEntry.findMany({ where: { eventId, ...(team ? {} : { kind: { not: "task" } }) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { votes: { where: { userId: actor?.id ?? "" } }, tickets: { where: { userId: actor?.id ?? "" } }, claims: { where: team ? {} : { userId: actor?.id ?? "" }, orderBy: [{ resolved: "asc" }, { id: "asc" }] } } });
  const voteCounts = await tx.communityVote.groupBy({ by: ["entryId", "option"], where: { entry: { eventId } }, _count: true });
  const waitingCounts = await tx.communityQueueTicket.groupBy({ by: ["entryId"], where: { entry: { eventId }, status: "WAITING" }, _count: true });
  const snapshot: CommunityEventSnapshot = { event: { id: event.id, name: event.nome }, permissions: { authenticated: !!actor, manage, team }, announcements: [], questions: [], polls: [], program: [], queues: [], tasks: [], lostItems: [], team: [], feedback: { eligible: await feedbackEligible(tx, event, actor), mine: null, average: null, count: 0, comments: [] } };
  for (const entry of entries) {
    if (entry.kind === "party.receipt" || entry.kind === "party.image") continue;
    const d = data(entry.data);
    if (entry.kind === "announcement" && (manage || d.archived !== true)) snapshot.announcements.push({ id: entry.id, title: string(d.title), message: string(d.message), createdAt: entry.createdAt.toISOString(), archived: d.archived === true });
    if (entry.kind === "question") snapshot.questions.push({ id: entry.id, text: string(d.text), answer: string(d.answer), highlighted: d.highlighted === true });
    if (entry.kind === "poll") { const options = strings(d.options); snapshot.polls.push({ id: entry.id, title: string(d.title), options, counts: options.map((_, index) => voteCounts.find(count => count.entryId === entry.id && count.option === index)?._count ?? 0), mine: entry.votes[0]?.option ?? null, closed: d.closed === true }); }
    if (entry.kind === "program") snapshot.program.push({ id: entry.id, title: string(d.title), startsAt: string(d.startsAt), status: d.status === "LIVE" || d.status === "DONE" ? d.status : "UPCOMING" });
    if (entry.kind === "queue") {
      const mine = entry.tickets[0];
      const position = mine?.status === "WAITING" ? 1 + await tx.communityQueueTicket.count({ where: { entryId: entry.id, status: "WAITING", OR: [{ createdAt: { lt: mine.createdAt } }, { createdAt: mine.createdAt, id: { lt: mine.id } }] } }) : 0;
      snapshot.queues.push({ id: entry.id, title: string(d.title), state: queueState(d.state), waiting: waitingCounts.find(count => count.entryId === entry.id)?._count ?? 0, mine: mine ? { status: mine.status, position } : null });
    }
    if (entry.kind === "task" && team) snapshot.tasks.push({ id: entry.id, title: string(d.title), assignedTo: string(d.assignedTo) || null, status: d.status === "DONE" || d.status === "HELP" ? d.status : "TODO" });
    if (entry.kind === "lost") snapshot.lostItems.push({ id: entry.id, title: string(d.title), description: string(d.description), returned: d.returned === true, claims: entry.claims.map(claim => ({ id: claim.id, message: claim.message, resolved: claim.resolved, userId: claim.userId })) });
  }
  snapshot.program.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  if (team) snapshot.team = (await tx.communityTeamMember.findMany({ where: { eventId }, include: { user: { select: { name: true } } } })).map(member => ({ userId: member.userId, name: member.user.name ?? "Colaborador" }));
  if (team) { const aggregate = await tx.communityFeedback.aggregate({ where: { eventId }, _avg: { rating: true }, _count: true }); snapshot.feedback.average = aggregate._avg.rating; snapshot.feedback.count = aggregate._count; }
  if (manage) snapshot.feedback.comments = await tx.communityFeedback.findMany({ where: { eventId }, take: 100, orderBy: { userId: "asc" }, select: { rating: true, comment: true } });
  if (actor) snapshot.feedback.mine = await tx.communityFeedback.findUnique({ where: { eventId_userId: { eventId, userId: actor.id } }, select: { rating: true, comment: true } });
  return snapshot;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
}

export async function mutateEvent(eventId: string, actor: Actor, action: CommunityAction): Promise<void> {
  await transact(async tx => {
    const { event, manage, team } = await access(tx, eventId, actor);
    if (["question.ask", "poll.vote", "queue.join"].includes(action.action) && event.status !== "PUBLISHED") throw new CommunityError(409, "Evento indisponível para novas participações.");
    const managerActions = ["poll.create", "poll.close", "program.save", "program.update", "program.status", "queue.create", "team.add", "team.remove", "task.create"];
    const teamActions = ["question.answer", "queue.next", "lost.create", "lost.resolve", "task.update"];
    if ((managerActions.includes(action.action) && !manage) || (teamActions.includes(action.action) && !team)) throw new CommunityError(403, "Sem permissão para esta ação.");
    const entries = communityEntries(tx, eventId, actor.id);
    const { find: entry, create, update } = entries;
    if (await handleAnnouncement(action, entries, manage) || await handleQueue(action, tx, entries, eventId, actor.id, { manage, team })) {
      await signal(tx, `event:${eventId}`);
      return;
    }
    switch (action.action) {
      case "question.ask": await create("question", { text: action.text, answer: "", highlighted: false }); break;
      case "question.answer": { const question = await entry(action.id, "question"); await update(action.id, "question", { answer: action.answer, highlighted: action.highlighted }); if (question.authorId !== actor.id) await notifyQuestionAnswer(tx, eventId, question.authorId, string(question.data.answer), action.answer); break; }
      case "poll.create": await create("poll", { title: action.title, options: action.options, closed: false }); break;
      case "poll.close": await update(action.id, "poll", { closed: true }); break;
      case "poll.vote": { const poll = await entry(action.id, "poll"); if (poll.data.closed === true || action.option >= strings(poll.data.options).length) throw new CommunityError(409, "Enquete encerrada ou opção inválida."); if (await tx.communityVote.findUnique({ where: { entryId_userId: { entryId: action.id, userId: actor.id } } })) throw new CommunityError(409, "Seu voto já foi registrado."); await tx.communityVote.create({ data: { entryId: action.id, userId: actor.id, option: action.option } }); break; }
      case "program.save": await create("program", { title: action.title, startsAt: action.startsAt, status: "UPCOMING" }); break;
      case "program.update": await update(action.id, "program", { title: action.title, startsAt: action.startsAt }); break;
      case "program.status": await update(action.id, "program", { status: action.status }); break;
      case "team.add": { const user = await tx.user.findFirst({ where: { email: { equals: action.email, mode: "insensitive" } }, select: { id: true } }); if (!user) throw new CommunityError(404, "Conta não encontrada."); const membership = await tx.communityTeamMember.findUnique({ where: { eventId_userId: { eventId, userId: user.id } } }); if (!membership && await tx.communityTeamMember.count({ where: { eventId } }) >= 50) throw new CommunityError(409, "Equipe cheia."); await tx.communityTeamMember.upsert({ where: { eventId_userId: { eventId, userId: user.id } }, create: { eventId, userId: user.id }, update: {} }); if (!membership) await tx.notification.create({ data: { userId: user.id, title: "Você entrou na equipe", message: `Colabore na organização de ${event.nome}.`, href: `/eventos/${eventId}/comunidade` } }); await signal(tx, `user:${user.id}`); break; }
      case "team.remove": await tx.communityTeamMember.deleteMany({ where: { eventId, userId: action.userId } }); await signal(tx, `user:${action.userId}`); break;
      case "task.create": if (action.assignedTo && action.assignedTo !== event.userId && !await tx.communityTeamMember.findUnique({ where: { eventId_userId: { eventId, userId: action.assignedTo } } })) throw new CommunityError(400, "Responsável deve integrar a equipe."); await create("task", { title: action.title, assignedTo: action.assignedTo ?? null, status: "TODO" }); if (action.assignedTo) { await tx.notification.create({ data: { userId: action.assignedTo, title: "Nova tarefa na equipe", message: action.title, href: `/eventos/${eventId}/comunidade` } }); await signal(tx, `user:${action.assignedTo}`); } break;
      case "task.update": { const task = await entry(action.id, "task"); if (!manage && string(task.data.assignedTo) !== actor.id) throw new CommunityError(403, "Esta tarefa pertence a outro colaborador."); await update(action.id, "task", { status: action.status }); if (event.userId !== actor.id) await notifyTaskHelp(tx, eventId, event.userId, string(task.data.status), action.status, string(task.data.title)); break; }
      case "lost.create": await create("lost", { title: action.title, description: action.description, returned: false }); break;
      case "lost.claim": { const item = await entry(action.id, "lost"); if (item.data.returned === true) throw new CommunityError(409, "Objeto já devolvido."); const existing = await tx.communityClaim.findUnique({ where: { entryId_userId: { entryId: action.id, userId: actor.id } } }); if (!existing && await tx.communityClaim.count({ where: { entryId: action.id } }) >= 100) throw new CommunityError(409, "Este objeto atingiu o limite de reivindicações. Contate a organização."); await tx.communityClaim.upsert({ where: { entryId_userId: { entryId: action.id, userId: actor.id } }, create: { entryId: action.id, userId: actor.id, message: action.message }, update: { message: action.message } }); break; }
      case "lost.resolve": { const claim = await tx.communityClaim.findUnique({ where: { id: action.claimId }, include: { entry: true } }); if (!claim || claim.entry.eventId !== eventId || claim.entry.kind !== "lost") throw new CommunityError(404, "Reivindicação não encontrada."); if (data(claim.entry.data).returned === true) throw new CommunityError(409, "Objeto já devolvido."); await tx.communityClaim.update({ where: { id: claim.id }, data: { resolved: true } }); await update(claim.entryId, "lost", { returned: true }); await notifyCommunityUser(tx, eventId, claim.userId, "Objeto devolvido", "A organização concluiu a devolução do objeto que você reivindicou."); break; }
      case "feedback.save": if (!await feedbackEligible(tx, event, actor)) throw new CommunityError(403, "Avaliação disponível após o evento para participantes confirmados."); await tx.communityFeedback.upsert({ where: { eventId_userId: { eventId, userId: actor.id } }, create: { eventId, userId: actor.id, rating: action.rating, comment: action.comment }, update: { rating: action.rating, comment: action.comment } }); break;
    }
    await signal(tx, `event:${eventId}`);
  });
}
