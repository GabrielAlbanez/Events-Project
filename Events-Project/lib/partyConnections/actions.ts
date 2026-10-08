import { Actor, CommunityError, signal, transact } from "@/lib/community/common";
import { PartyAction } from "@/schemas/partyConnections";
import { pairAccess, partyParticipant } from "./access";

export async function connectionsAction(eventId: string, actor: Actor, input: PartyAction): Promise<void> {
  await transact(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`party:${eventId}`}, 0))`;
    if (!await tx.user.findUnique({ where: { id: actor.id }, select: { id: true } })) throw new CommunityError(401, "Entre novamente.");
    if (input.action === "profile.leave") {
      await tx.partyProfile.updateMany({ where: { eventId, userId: actor.id }, data: { active: false } });
      await tx.partyLike.deleteMany({ where: { eventId, OR: [{ fromId: actor.id }, { toId: actor.id }] } });
      const matches = await tx.partyMatch.findMany({ where: { eventId, OR: [{ userAId: actor.id }, { userBId: actor.id }], active: true }, select: { id: true } });
      await tx.partyMatch.updateMany({ where: { id: { in: matches.map(match => match.id) } }, data: { active: false } });
      for (const match of matches) await signal(tx, `match:${match.id}`);
    } else if (input.action === "unblock") {
      await tx.partyBlock.deleteMany({ where: { fromId: actor.id, toId: input.userId } });
    } else if (input.action === "block") {
      if (input.userId === actor.id || !await tx.user.findUnique({ where: { id: input.userId }, select: { id: true } })) throw new CommunityError(400, "Conta inválida.");
      if (await tx.partyBlock.count({ where: { fromId: actor.id } }) >= 200 && !await tx.partyBlock.findUnique({ where: { fromId_toId: { fromId: actor.id, toId: input.userId } } })) throw new CommunityError(429, "Limite de bloqueios atingido.");
      await tx.partyBlock.upsert({ where: { fromId_toId: { fromId: actor.id, toId: input.userId } }, create: { fromId: actor.id, toId: input.userId }, update: {} });
      await tx.partyLike.deleteMany({ where: { OR: [{ fromId: actor.id, toId: input.userId }, { fromId: input.userId, toId: actor.id }] } });
      const matches = await tx.partyMatch.findMany({ where: { OR: [{ userAId: actor.id, userBId: input.userId }, { userAId: input.userId, userBId: actor.id }] }, select: { id: true, eventId: true } });
      await tx.partyMatch.updateMany({ where: { id: { in: matches.map(match => match.id) } }, data: { active: false } });
      for (const match of matches) { await signal(tx, `match:${match.id}`); await signal(tx, `party:${match.eventId}`); }
      await signal(tx, `user:${input.userId}`);
    } else if (input.action === "report") {
      if (input.userId === actor.id) throw new CommunityError(400, "Conta inválida.");
      if (await tx.partyReport.count({ where: { reporterId: actor.id, createdAt: { gte: new Date(Date.now() - 3600000) } } }) >= 10) throw new CommunityError(429, "Aguarde antes de enviar outra denúncia.");
      const [own, target] = await Promise.all([tx.partyProfile.findUnique({ where: { eventId_userId: { eventId, userId: actor.id } } }), tx.partyProfile.findUnique({ where: { eventId_userId: { eventId, userId: input.userId } } })]);
      if (!own || !target) throw new CommunityError(403, "Perfil indisponível.");
      let evidence: string | null = null;
      if (input.messageId) {
        const message = await tx.partyMessage.findUnique({ where: { id: input.messageId }, include: { match: true } });
        if (!message || message.authorId !== input.userId || message.match.eventId !== eventId || ![message.match.userAId, message.match.userBId].includes(actor.id)) throw new CommunityError(403, "Mensagem indisponível.");
        evidence = message.text;
      }
      await tx.partyReport.create({ data: { eventId, reporterId: actor.id, targetId: input.userId, reason: input.reason, evidence } });
    } else {
      if (!await partyParticipant(tx, eventId, actor.id)) throw new CommunityError(403, "Confirme sua inscrição para participar.");
      if (input.action === "profile.save") {
        if (input.intent === "DATING" && !input.adultDeclared) throw new CommunityError(403, "Paquera exige declaração de maioridade.");
        const { action: _action, ...profile } = input;
        await tx.partyProfile.upsert({ where: { eventId_userId: { eventId, userId: actor.id } }, create: { eventId, userId: actor.id, ...profile }, update: { ...profile, active: true } });
        const matches = await tx.partyMatch.findMany({ where: { eventId, OR: [{ userAId: actor.id }, { userBId: actor.id }] }, select: { id: true } });
        for (const match of matches) await signal(tx, `match:${match.id}`);
      } else if (input.action === "like") {
        await pairAccess(tx, eventId, actor.id, input.userId);
        const key = { eventId, fromId: actor.id, toId: input.userId };
        const existing = await tx.partyLike.findUnique({ where: { eventId_fromId_toId: key } });
        if (!existing && await tx.partyLike.count({ where: { fromId: actor.id, createdAt: { gte: new Date(Date.now() - 60000) } } }) >= 30) throw new CommunityError(429, "Aguarde antes de curtir mais perfis.");
        await tx.partyLike.upsert({ where: { eventId_fromId_toId: key }, create: key, update: {} });
        if (await tx.partyLike.findUnique({ where: { eventId_fromId_toId: { eventId, fromId: input.userId, toId: actor.id } } })) {
          const [userAId, userBId] = [actor.id, input.userId].sort();
          const match = await tx.partyMatch.findUnique({ where: { eventId_userAId_userBId: { eventId, userAId, userBId } } });
          if (!match?.active) {
            await tx.partyMatch.upsert({ where: { eventId_userAId_userBId: { eventId, userAId, userBId } }, create: { eventId, userAId, userBId }, update: { active: true } });
            for (const userId of [actor.id, input.userId]) {
              await tx.notification.create({ data: { userId, title: "Nova conexão na festa", message: "O interesse foi mútuo. Abra suas conexões para conversar.", href: `/eventos/${eventId}/conexoes` } });
              await signal(tx, `user:${userId}`);
            }
          }
        }
      }
    }
    if (input.action !== "like" && input.action !== "report") await signal(tx, `party:${eventId}`);
    await signal(tx, `user:${actor.id}`);
  });
}
