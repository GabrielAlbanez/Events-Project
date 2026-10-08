import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { MobileAuthError, type MobileUser } from './auth-service';

type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;
type CommunityKind = 'QUESTION' | 'ANNOUNCEMENT' | 'POLL' | 'PROGRAM' | 'QUEUE' | 'TASK' | 'LOST';
type JsonObject = Record<string, unknown>;
type EntryRow = { id: string; kind: CommunityKind; authorId: string; data: JsonObject; createdAt: Date | string };
export type CommunityDomainSubscription =
  | { eventId: string }
  | { roomId: string }
  | { chatEventId: string }
  | { partyEventId: string }
  | { matchId: string }
  | { user: true };

export interface CommunityRealtimeAccess {
  canSubscribe(actor: { id: string; role: string }, subscription: CommunityDomainSubscription): Promise<boolean>;
}

function fail(status: number, message: string): never {
  throw new MobileAuthError(status, message);
}

function object(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function text(value: unknown, field: string, max: number, min = 1): string {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    fail(400, `Confira o campo ${field}.`);
  }
  return value.trim();
}

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isRecord(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

async function eventPermissions(db: Queryable, eventId: string, userId: string | null, role?: string) {
  const result = await db.query<{
    id: string; name: string; status: string; ownerId: string | null; authenticated: boolean; team: boolean;
  }>(
    `SELECT e.id, e.nome AS name, e.status, e."userId" AS "ownerId",
            ($2::text IS NOT NULL) AS authenticated,
            EXISTS (SELECT 1 FROM "CommunityTeamMember" t WHERE t."eventId" = e.id AND t."userId" = $2) AS team
       FROM events e
      WHERE e.id = $1`,
    [eventId, userId],
  );
  const event = result.rows[0];
  if (!event || !['PUBLISHED', 'CANCELLED', 'ENDED'].includes(event.status)) fail(404, 'Evento indisponível.');
  const manage = Boolean(userId && (role === 'ADMIN' || event.ownerId === userId));
  return { event, authenticated: Boolean(userId), manage, team: Boolean(userId && event.team) };
}

async function requireRegistered(db: Queryable, eventId: string, userId: string): Promise<void> {
  const result = await db.query(
    `SELECT 1 FROM "EventRegistration"
      WHERE "eventId" = $1 AND "userId" = $2 AND status = ANY($3::"RegistrationStatus"[]) LIMIT 1`,
    [eventId, userId, ['CONFIRMED', 'CHECKED_IN']],
  );
  if (!result.rowCount) fail(403, 'Confirme sua presença no evento para continuar.');
}

export class PostgresCommunityService {
  constructor(private readonly pool: Pool) {}

  async snapshot(eventId: string, user: Pick<MobileUser, 'id' | 'role'> | null) {
    const permissions = await eventPermissions(this.pool, eventId, user?.id ?? null, user?.role);
    const result = await this.pool.query<EntryRow>(
      `SELECT id, kind, "authorId", data, "createdAt"
         FROM "CommunityEntry"
        WHERE "eventId" = $1
        ORDER BY "createdAt" ASC, id ASC
        LIMIT 500`,
      [eventId],
    );
    const entries = result.rows;
    const byKind = (kind: CommunityKind) => entries.filter(entry => entry.kind === kind);
    const questions = byKind('QUESTION').map(({ id, data }) => ({
      id, text: String(data.text ?? ''), answer: String(data.answer ?? ''),
      highlighted: data.highlighted === true,
    }));
    const announcements = byKind('ANNOUNCEMENT').map(({ id, data, createdAt }) => ({
      id, title: String(data.title ?? ''), message: String(data.message ?? ''),
      createdAt: timestamp(createdAt), archived: data.archived === true,
    }));
    const polls = await Promise.all(byKind('POLL').map(async ({ id, data }) => {
      const votes = await this.pool.query<{ option: number; count: string; mine: boolean }>(
        `SELECT option, COUNT(*)::int AS count,
                BOOL_OR("userId" = $2) AS mine
           FROM "CommunityVote" WHERE "entryId" = $1 GROUP BY option`,
        [id, user?.id ?? null],
      );
      const options = stringArray(data.options);
      const counts = options.map((_, index) => Number(votes.rows.find(vote => vote.option === index)?.count ?? 0));
      const own = votes.rows.find(vote => vote.mine);
      return { id, title: String(data.title ?? ''), options, counts, mine: own?.option ?? null, closed: data.closed === true };
    }));
    const program = byKind('PROGRAM').map(({ id, data }) => ({
      id, title: String(data.title ?? ''), startsAt: String(data.startsAt ?? ''),
      status: ['LIVE', 'DONE'].includes(String(data.status)) ? data.status as 'LIVE' | 'DONE' : 'UPCOMING',
    }));
    const queues = await Promise.all(byKind('QUEUE').map(async ({ id, data }) => {
      const [stats, myTicket] = await Promise.all([
        this.pool.query<{ waiting: number }>(
          `SELECT COUNT(*)::int AS waiting FROM "CommunityQueueTicket"
            WHERE "entryId" = $1 AND status = 'WAITING'`,
          [id],
        ),
        user ? this.pool.query<{ status: string; position: number | null }>(
          `SELECT t.status,
                  CASE WHEN t.status = 'WAITING' THEN
                    (SELECT COUNT(*)::int + 1 FROM "CommunityQueueTicket" earlier
                      WHERE earlier."entryId" = t."entryId" AND earlier.status = 'WAITING'
                        AND (earlier."createdAt", earlier.id) < (t."createdAt", t.id))
                  ELSE NULL END AS position
             FROM "CommunityQueueTicket" t
            WHERE t."entryId" = $1 AND t."userId" = $2
              AND t.status = ANY(ARRAY['WAITING','CALLED']) LIMIT 1`,
          [id, user.id],
        ) : Promise.resolve({ rows: [] as { status: string; position: number | null }[] }),
      ]);
      const mine = myTicket.rows[0]
        ? { status: myTicket.rows[0].status, position: Number(myTicket.rows[0].position ?? 0) }
        : null;
      return {
        id, title: String(data.title ?? ''), state: ['PAUSED', 'CLOSED'].includes(String(data.state))
          ? data.state as 'PAUSED' | 'CLOSED' : 'OPEN',
        waiting: Number(stats.rows[0]?.waiting ?? 0), mine,
      };
    }));
    const tasks = byKind('TASK').map(({ id, data }) => ({
      id, title: String(data.title ?? ''), assignedTo: typeof data.assignedTo === 'string' ? data.assignedTo : null,
      status: ['DONE', 'HELP'].includes(String(data.status)) ? data.status as 'DONE' | 'HELP' : 'TODO',
    }));
    const lostEntries = byKind('LOST');
    const claims = lostEntries.length && (permissions.manage || permissions.team) ? await this.pool.query<{
      id: string; entryId: string; message: string; resolved: boolean; userId: string;
    }>(
      `SELECT c.id, c."entryId", c.message, c.resolved, c."userId"
         FROM "CommunityClaim" c
         JOIN "CommunityEntry" e ON e.id = c."entryId"
        WHERE e."eventId" = $1 ORDER BY c.id`,
      [eventId],
    ) : { rows: [] };
    const lostItems = lostEntries.map(({ id, data }) => ({
      id, title: String(data.title ?? ''), description: String(data.description ?? ''),
      returned: data.returned === true,
      claims: claims.rows.filter(claim => claim.entryId === id).map(({ id: claimId, message, resolved, userId }) => ({
        id: claimId, message, resolved, userId,
      })),
    }));
    const team = permissions.manage || permissions.team
      ? (await this.pool.query<{ userId: string; name: string }>(
        `SELECT u.id AS "userId", COALESCE(u.name, u.email, 'Participante') AS name
           FROM "CommunityTeamMember" t JOIN "User" u ON u.id = t."userId"
          WHERE t."eventId" = $1 ORDER BY name`,
        [eventId],
      )).rows : [];
    const feedbackEligible = user ? await this.isFeedbackEligible(eventId, user.id) : false;
    const feedbackResult = await this.pool.query<{ rating: number; comment: string; average: number | null; count: number }>(
      `SELECT rating, comment,
              (AVG(rating) OVER ())::float AS average, (COUNT(*) OVER ())::int AS count
         FROM "CommunityFeedback" WHERE "eventId" = $1 ORDER BY rating DESC, "userId" LIMIT 100`,
      [eventId],
    );
    const ownFeedback = user ? await this.pool.query<{ rating: number; comment: string }>(
      `SELECT rating, comment FROM "CommunityFeedback" WHERE "eventId" = $1 AND "userId" = $2`,
      [eventId, user.id],
    ) : { rows: [] };
    return {
      event: { id: permissions.event.id, name: permissions.event.name },
      permissions: { authenticated: permissions.authenticated, manage: permissions.manage, team: permissions.team },
      questions, announcements, polls, program, queues, tasks, lostItems, team,
      feedback: {
        eligible: feedbackEligible,
        mine: ownFeedback.rows[0] ?? null,
        average: feedbackResult.rows[0]?.average ?? null,
        count: feedbackResult.rows[0]?.count ?? 0,
        comments: feedbackResult.rows.map(({ rating, comment }) => ({ rating, comment })).filter(item => item.comment),
      },
    };
  }

  private async ticketStatus(entryId: string, userId: string): Promise<string> {
    const result = await this.pool.query<{ status: string }>(
      `SELECT status FROM "CommunityQueueTicket" WHERE "entryId" = $1 AND "userId" = $2`,
      [entryId, userId],
    );
    return result.rows[0]?.status ?? 'WAITING';
  }

  private async isFeedbackEligible(eventId: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM "EventRegistration" r JOIN events e ON e.id = r."eventId"
        WHERE r."eventId" = $1 AND r."userId" = $2
          AND r.status = 'CHECKED_IN' AND e.status <> 'CANCELLED'
          AND (e.status = 'ENDED' OR e."dataFim" <= CURRENT_DATE::text) LIMIT 1`,
      [eventId, userId],
    );
    return Boolean(result.rowCount);
  }

  async action(eventId: string, user: MobileUser | null, input: unknown): Promise<{ ok: true }> {
    if (!isRecord(input) || typeof input.action !== 'string') fail(400, 'Ação inválida.');
    const action = input.action;
    const permissions = await eventPermissions(this.pool, eventId, user?.id ?? null, user?.role);
    const requireUser = () => {
      if (!user) fail(401, 'Entre na sua conta para continuar.');
      return user;
    };
    const requireManage = () => {
      requireUser();
      if (!permissions.manage) fail(403, 'Apenas o organizador pode gerenciar este conteúdo.');
    };
    const requireTeam = () => {
      requireUser();
      if (!permissions.manage && !permissions.team) fail(403, 'Acesso restrito à equipe do evento.');
    };
    const id = typeof input.id === 'string' ? input.id : '';
    const entry = async (entryId: string, kind?: CommunityKind, db: Queryable = this.pool) => {
      const result = await db.query<EntryRow>(
        `SELECT id, kind, "authorId", data, "createdAt" FROM "CommunityEntry"
          WHERE id = $1 AND "eventId" = $2 ${kind ? 'AND kind = $3' : ''} LIMIT 1`,
        kind ? [entryId, eventId, kind] : [entryId, eventId],
      );
      if (!result.rows[0]) fail(404, 'Conteúdo indisponível.');
      return result.rows[0];
    };
    const insert = async (kind: CommunityKind, data: JsonObject) => {
      const actor = requireUser();
      await this.pool.query(
        `INSERT INTO "CommunityEntry" (id, "eventId", kind, "authorId", data)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [randomUUID(), eventId, kind, actor.id, JSON.stringify(data)],
      );
    };
    if (action === 'question.ask') {
      const actor = requireUser();
      await requireRegistered(this.pool, eventId, actor.id);
      await insert('QUESTION', { text: text(input.text, 'pergunta', 1000), answer: '', highlighted: false });
    } else if (action === 'poll.vote') {
      const actor = requireUser();
      const poll = await entry(id, 'POLL');
      const options = stringArray(poll.data.options);
      if (poll.data.closed === true) fail(409, 'Esta enquete foi encerrada.');
      if (!Number.isInteger(input.option) || Number(input.option) < 0 || Number(input.option) >= options.length) fail(400, 'Opção inválida.');
      await this.pool.query(
        `INSERT INTO "CommunityVote" ("entryId", "userId", option) VALUES ($1, $2, $3)
         ON CONFLICT ("entryId", "userId") DO UPDATE SET option = EXCLUDED.option`,
        [id, actor.id, input.option],
      );
    } else if (action === 'queue.join' || action === 'queue.leave') {
      const actor = requireUser();
      await requireRegistered(this.pool, eventId, actor.id);
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const queue = await entry(id, 'QUEUE', client);
        if (action === 'queue.join' && queue.data.state !== 'OPEN') fail(409, 'Esta fila não está aberta.');
        if (action === 'queue.join') {
          await client.query(
            `INSERT INTO "CommunityQueueTicket" (id, "entryId", "userId", status)
             VALUES ($1, $2, $3, 'WAITING')
             ON CONFLICT ("entryId", "userId") DO UPDATE SET status = 'WAITING', "createdAt" = NOW()`,
            [randomUUID(), id, actor.id],
          );
        } else {
          await client.query(`DELETE FROM "CommunityQueueTicket" WHERE "entryId" = $1 AND "userId" = $2`, [id, actor.id]);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } else if (action === 'lost.claim') {
      const actor = requireUser();
      await requireRegistered(this.pool, eventId, actor.id);
      const lost = await entry(id, 'LOST');
      if (lost.data.returned === true) fail(409, 'Este item já foi devolvido.');
      await this.pool.query(
        `INSERT INTO "CommunityClaim" (id, "entryId", "userId", message)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ("entryId", "userId") DO UPDATE SET message = EXCLUDED.message, resolved = FALSE`,
        [randomUUID(), id, actor.id, text(input.message, 'mensagem', 1000)],
      );
    } else if (action === 'feedback.save') {
      const actor = requireUser();
      if (!Number.isInteger(input.rating) || Number(input.rating) < 1 || Number(input.rating) > 5) fail(400, 'Avaliação inválida.');
      if (!await this.isFeedbackEligible(eventId, actor.id)) fail(403, 'A avaliação fica disponível após a entrada no evento.');
      await this.pool.query(
        `INSERT INTO "CommunityFeedback" ("eventId", "userId", rating, comment)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ("eventId", "userId") DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment`,
        [eventId, actor.id, input.rating, typeof input.comment === 'string' ? input.comment.trim().slice(0, 2000) : ''],
      );
    } else if (action === 'lost.create') {
      requireTeam();
      await insert('LOST', {
        title: text(input.title, 'título', 160),
        description: text(input.description, 'descrição', 2000),
        returned: false,
      });
    } else if (action === 'task.update') {
      const actor = requireUser();
      const task = await entry(id, 'TASK');
      if (!permissions.manage && (!permissions.team || task.data.assignedTo !== actor.id)) {
        fail(403, 'Apenas a pessoa responsável ou o organizador pode atualizar esta tarefa.');
      }
      if (!['TODO', 'DONE', 'HELP'].includes(String(input.status))) fail(400, 'Status de tarefa inválido.');
      await this.pool.query(
        `UPDATE "CommunityEntry" SET data = jsonb_set(data, '{status}', to_jsonb($2::text)) WHERE id = $1`,
        [task.id, input.status],
      );
    } else if (action === 'queue.next') {
      requireTeam();
      await this.nextQueueTicket(id, eventId);
    } else {
      requireManage();
      if (action === 'announcement.publish') {
        await insert('ANNOUNCEMENT', { title: text(input.title, 'título', 160), message: text(input.message, 'mensagem', 4000), archived: false });
      } else if (action === 'poll.create') {
        const options = Array.isArray(input.options) ? input.options.map(value => text(value, 'opção', 120)) : [];
        if (options.length < 2 || options.length > 8 || new Set(options).size !== options.length) fail(400, 'Informe de 2 a 8 opções diferentes.');
        await insert('POLL', { title: text(input.title, 'título', 160), options, closed: false });
      } else if (action === 'program.save') {
        const startsAt = text(input.startsAt, 'data', 64);
        if (!Number.isFinite(Date.parse(startsAt))) fail(400, 'Data de programação inválida.');
        await insert('PROGRAM', { title: text(input.title, 'título', 160), startsAt: new Date(startsAt).toISOString(), status: 'UPCOMING' });
      } else if (action === 'queue.create') {
        await insert('QUEUE', { title: text(input.title, 'título', 160), state: 'OPEN' });
      } else if (action === 'task.create') {
        const assignedTo = typeof input.assignedTo === 'string' && input.assignedTo ? input.assignedTo : null;
        if (assignedTo) {
          const member = await this.pool.query(`SELECT 1 FROM "CommunityTeamMember" WHERE "eventId" = $1 AND "userId" = $2`, [eventId, assignedTo]);
          if (!member.rowCount) fail(400, 'A pessoa responsável não pertence à equipe.');
        }
        await insert('TASK', { title: text(input.title, 'título', 160), assignedTo, status: 'TODO' });
      } else if (action === 'team.add') {
        const email = text(input.email, 'e-mail', 254).toLowerCase();
        const result = await this.pool.query<{ id: string }>(`SELECT id FROM "User" WHERE lower(email) = $1 AND "emailVerified" = TRUE LIMIT 1`, [email]);
        if (!result.rows[0]) fail(404, 'Conta verificada não encontrada.');
        await this.pool.query(
          `INSERT INTO "CommunityTeamMember" ("eventId", "userId") VALUES ($1, $2)
           ON CONFLICT ("eventId", "userId") DO NOTHING`,
          [eventId, result.rows[0].id],
        );
      } else if (action === 'announcement.archive') {
        const row = await entry(id, 'ANNOUNCEMENT');
        await this.pool.query(`UPDATE "CommunityEntry" SET data = jsonb_set(data, '{archived}', 'true'::jsonb) WHERE id = $1`, [row.id]);
      } else if (action === 'poll.close') {
        const row = await entry(id, 'POLL');
        await this.pool.query(`UPDATE "CommunityEntry" SET data = jsonb_set(data, '{closed}', 'true'::jsonb) WHERE id = $1`, [row.id]);
      } else if (action === 'program.status') {
        if (!['UPCOMING', 'LIVE', 'DONE'].includes(String(input.status))) fail(400, 'Status inválido.');
        await entry(id, 'PROGRAM');
        await this.pool.query(`UPDATE "CommunityEntry" SET data = jsonb_set(data, '{status}', to_jsonb($2::text)) WHERE id = $1`, [id, input.status]);
      } else if (action === 'queue.control') {
        if (!['OPEN', 'PAUSED', 'CLOSED'].includes(String(input.state))) fail(400, 'Estado inválido.');
        await entry(id, 'QUEUE');
        await this.pool.query(`UPDATE "CommunityEntry" SET data = jsonb_set(data, '{state}', to_jsonb($2::text)) WHERE id = $1`, [id, input.state]);
        if (input.state === 'CLOSED') {
          await this.pool.query(`UPDATE "CommunityQueueTicket" SET status = 'CANCELLED' WHERE "entryId" = $1 AND status = 'WAITING'`, [id]);
        }
      } else if (action === 'question.answer') {
        const answer = text(input.answer, 'resposta', 2000);
        await entry(id, 'QUESTION');
        await this.pool.query(
          `UPDATE "CommunityEntry"
              SET data = jsonb_set(jsonb_set(data, '{answer}', to_jsonb($2::text)), '{highlighted}', to_jsonb($3::boolean))
            WHERE id = $1`,
          [id, answer, input.highlighted === true],
        );
      } else if (action === 'lost.resolve') {
        const claimId = text(input.claimId, 'reivindicação', 100);
        const result = await this.pool.query<{ entryId: string }>(
          `UPDATE "CommunityClaim" c SET resolved = TRUE
            FROM "CommunityEntry" e
           WHERE c.id = $1 AND c."entryId" = e.id AND e."eventId" = $2
           RETURNING c."entryId" AS "entryId"`,
          [claimId, eventId],
        );
        if (!result.rowCount) fail(404, 'Reivindicação indisponível.');
        await this.pool.query(
          `UPDATE "CommunityEntry" SET data = jsonb_set(data, '{returned}', 'true'::jsonb) WHERE id = $1`,
          [result.rows[0].entryId],
        );
      } else if (action === 'team.remove') {
        const userId = text(input.userId, 'usuário', 100);
        if (userId === user!.id) fail(400, 'O organizador não pode remover a própria conta da equipe.');
        await this.pool.query(`DELETE FROM "CommunityTeamMember" WHERE "eventId" = $1 AND "userId" = $2`, [eventId, userId]);
      } else {
        fail(400, 'Ação de comunidade desconhecida.');
      }
    }

    return { ok: true };
  }

  private async nextQueueTicket(entryId: string, eventId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const queue = await client.query<{ data: JsonObject }>(
        `SELECT data FROM "CommunityEntry" WHERE id = $1 AND "eventId" = $2 AND kind = 'QUEUE' FOR UPDATE`,
        [entryId, eventId],
      );
      if (!queue.rows[0]) fail(404, 'Fila indisponível.');
      if (queue.rows[0].data.state === 'CLOSED') fail(409, 'Esta fila está fechada.');
      const next = await client.query(
        `SELECT id FROM "CommunityQueueTicket"
          WHERE "entryId" = $1 AND status = 'WAITING'
          ORDER BY "createdAt", id LIMIT 1 FOR UPDATE SKIP LOCKED`,
        [entryId],
      );
      if (!next.rowCount) fail(409, 'Não há pessoas aguardando.');
      await client.query(`UPDATE "CommunityQueueTicket" SET status = 'CALLED' WHERE id = $1`, [next.rows[0].id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async rooms(user: MobileUser): Promise<{ rooms: unknown[] }> {
    const result = await this.pool.query(
      `SELECT r.id, r.name, (r."ownerId" = $1) AS owner,
              COUNT(DISTINCT m."userId")::int AS members,
              COUNT(DISTINCT s.id)::int AS suggestions
         FROM "FriendsRoom" r
         JOIN "FriendsRoomMember" mine ON mine."roomId" = r.id AND mine."userId" = $1
         LEFT JOIN "FriendsRoomMember" m ON m."roomId" = r.id
         LEFT JOIN "FriendsSuggestion" s ON s."roomId" = r.id
        GROUP BY r.id ORDER BY r."createdAt" DESC LIMIT 100`,
      [user.id],
    );
    return { rooms: result.rows };
  }

  async createRoom(user: MobileUser, input: unknown): Promise<{ id: string; name: string }> {
    if (!isRecord(input)) fail(400, 'Dados da sala inválidos.');
    if (input.action !== 'room.create') fail(400, 'Ação de sala inválida.');
    const name = text(input.name, 'nome', 80);
    const id = randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO "FriendsRoom" (id, name, "ownerId") VALUES ($1, $2, $3)`, [id, name, user.id]);
      await client.query(`INSERT INTO "FriendsRoomMember" ("roomId", "userId") VALUES ($1, $2)`, [id, user.id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return { id, name };
  }

  async room(roomId: string, user: MobileUser) {
    const roomResult = await this.pool.query<{ id: string; name: string; ownerId: string }>(
      `SELECT r.id, r.name, r."ownerId" FROM "FriendsRoom" r
        JOIN "FriendsRoomMember" m ON m."roomId" = r.id AND m."userId" = $2
       WHERE r.id = $1 LIMIT 1`,
      [roomId, user.id],
    );
    const room = roomResult.rows[0];
    if (!room) fail(404, 'Sala indisponível.');
    const [members, suggestions, availableEvents] = await Promise.all([
      this.pool.query<{ id: string; name: string }>(
        `SELECT u.id, COALESCE(u.name, u.email, 'Participante') AS name
           FROM "FriendsRoomMember" m JOIN "User" u ON u.id = m."userId"
          WHERE m."roomId" = $1 ORDER BY name`,
        [roomId],
      ),
      this.pool.query(
        `SELECT s.id, s."eventId", s."authorId", COALESCE(author.name, author.email, 'Participante') AS "authorName",
                e.nome AS "eventName", e."dataInicio" AS date,
                COUNT(DISTINCT v."userId")::int AS votes,
                BOOL_OR(v."userId" = $2) FILTER (WHERE v."userId" IS NOT NULL) AS mine
           FROM "FriendsSuggestion" s JOIN events e ON e.id = s."eventId"
           JOIN "User" author ON author.id = s."authorId"
           LEFT JOIN "FriendsVote" v ON v."suggestionId" = s.id
          WHERE s."roomId" = $1 GROUP BY s.id, author.name, author.email, e.nome, e."dataInicio"
          ORDER BY votes DESC, s.id`,
        [roomId, user.id],
      ),
      this.pool.query(
        `SELECT e.id, e.nome AS name, e."dataInicio" AS date
           FROM events e
          WHERE e.status = 'PUBLISHED'
            AND NOT EXISTS (SELECT 1 FROM "FriendsSuggestion" s WHERE s."roomId" = $1 AND s."eventId" = e.id)
          ORDER BY e."dataInicio" LIMIT 100`,
        [roomId],
      ),
    ]);
    return {
      id: room.id, name: room.name, owner: room.ownerId === user.id,
      members: members.rows,
      suggestions: suggestions.rows.map(row => ({
        id: row.id, event: { id: row.eventId, name: row.eventName, date: row.date },
        authorName: row.authorName, votes: row.votes, mine: row.mine === true,
      })),
      availableEvents: availableEvents.rows,
    };
  }

  async roomAction(roomId: string, user: MobileUser, input: unknown): Promise<{ ok: true }> {
    if (!isRecord(input) || typeof input.action !== 'string') fail(400, 'Ação inválida.');
    const membership = await this.pool.query<{ ownerId: string }>(
      `SELECT r."ownerId" FROM "FriendsRoom" r
        JOIN "FriendsRoomMember" m ON m."roomId" = r.id AND m."userId" = $2
       WHERE r.id = $1 LIMIT 1`,
      [roomId, user.id],
    );
    const room = membership.rows[0];
    if (!room) fail(404, 'Sala indisponível.');
    const owner = room.ownerId === user.id;
    if (input.action === 'suggestion.vote') {
      const suggestionId = text(input.suggestionId, 'sugestão', 100);
      const allowed = await this.pool.query(`SELECT 1 FROM "FriendsSuggestion" WHERE id = $1 AND "roomId" = $2`, [suggestionId, roomId]);
      if (!allowed.rowCount) fail(404, 'Sugestão indisponível.');
      if (input.voted === true) {
        await this.pool.query(
          `INSERT INTO "FriendsVote" ("suggestionId", "userId") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [suggestionId, user.id],
        );
      } else {
        await this.pool.query(`DELETE FROM "FriendsVote" WHERE "suggestionId" = $1 AND "userId" = $2`, [suggestionId, user.id]);
      }
    } else if (input.action === 'suggestion.add') {
      const eventId = text(input.eventId, 'evento', 100);
      const exists = await this.pool.query(`SELECT 1 FROM events WHERE id = $1 AND status = 'PUBLISHED'`, [eventId]);
      if (!exists.rowCount) fail(404, 'Evento indisponível.');
      await this.pool.query(
        `INSERT INTO "FriendsSuggestion" (id, "roomId", "eventId", "authorId")
         VALUES ($1, $2, $3, $4) ON CONFLICT ("roomId", "eventId") DO NOTHING`,
        [randomUUID(), roomId, eventId, user.id],
      );
    } else if (input.action === 'member.add' || input.action === 'member.remove') {
      if (!owner) fail(403, 'Apenas quem criou a sala pode gerenciar participantes.');
      if (input.action === 'member.add') {
        const email = text(input.email, 'e-mail', 254).toLowerCase();
        const invitee = await this.pool.query<{ id: string }>(
          `SELECT id FROM "User" WHERE lower(email) = $1 AND "emailVerified" = TRUE LIMIT 1`,
          [email],
        );
        if (!invitee.rows[0]) fail(404, 'Conta verificada não encontrada.');
        await this.pool.query(
          `INSERT INTO "FriendsRoomMember" ("roomId", "userId") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [roomId, invitee.rows[0].id],
        );
      } else {
        const userId = text(input.userId, 'usuário', 100);
        if (userId === room.ownerId) fail(400, 'Quem criou a sala não pode sair por esta ação.');
        await this.pool.query(`DELETE FROM "FriendsRoomMember" WHERE "roomId" = $1 AND "userId" = $2`, [roomId, userId]);
      }
    } else {
      fail(400, 'Ação de sala desconhecida.');
    }
    return { ok: true };
  }

  async activity(user: MobileUser) {
    const [registrations, queues, tasks, rooms] = await Promise.all([
      this.pool.query(
        `SELECT r.id, r."eventId", e.nome AS "eventName", e.banner, e."dataInicio" AS "startsAt",
                e."dataFim" AS "endsAt", r.status
           FROM "EventRegistration" r JOIN events e ON e.id = r."eventId"
          WHERE r."userId" = $1 AND r.status = ANY($2::"RegistrationStatus"[])
          ORDER BY e."dataInicio" LIMIT 100`,
        [user.id, ['CONFIRMED', 'CHECKED_IN']],
      ),
      this.pool.query(
        `SELECT t.id, e.id AS "eventId", e.nome AS "eventName", ce.data->>'title' AS title,
                t.status, ROW_NUMBER() OVER (PARTITION BY t."entryId" ORDER BY t."createdAt", t.id)::int AS position
           FROM "CommunityQueueTicket" t
           JOIN "CommunityEntry" ce ON ce.id = t."entryId"
           JOIN events e ON e.id = ce."eventId"
          WHERE t."userId" = $1 AND t.status IN ('WAITING','CALLED') AND ce.kind = 'QUEUE'
          ORDER BY t."createdAt" LIMIT 100`,
        [user.id],
      ),
      this.pool.query(
        `SELECT ce.id, e.id AS "eventId", e.nome AS "eventName", ce.data->>'title' AS title,
                COALESCE(ce.data->>'status', 'TODO') AS status
           FROM "CommunityEntry" ce JOIN events e ON e.id = ce."eventId"
           JOIN "CommunityTeamMember" t ON t."eventId" = ce."eventId" AND t."userId" = $1
          WHERE ce.kind = 'TASK'
            AND (ce.data->>'assignedTo' = $1 OR ce.data->>'assignedTo' IS NULL)
            AND ce.data->>'status' <> 'DONE'
          ORDER BY ce."createdAt" DESC LIMIT 100`,
        [user.id],
      ),
      this.pool.query(
        `SELECT r.id, r.name,
                COUNT(DISTINCT m."userId")::int AS members,
                COUNT(DISTINCT s.id)::int AS suggestions
           FROM "FriendsRoom" r
           JOIN "FriendsRoomMember" mine ON mine."roomId" = r.id AND mine."userId" = $1
           LEFT JOIN "FriendsRoomMember" m ON m."roomId" = r.id
           LEFT JOIN "FriendsSuggestion" s ON s."roomId" = r.id
          GROUP BY r.id ORDER BY r."createdAt" DESC LIMIT 100`,
        [user.id],
      ),
    ]);
    const data = {
      registrations: registrations.rows.map(row => ({
        ...row, status: row.status as 'CONFIRMED' | 'CHECKED_IN',
      })),
      queues: queues.rows.map(row => ({
        ...row, title: row.title ?? '', status: row.status as 'WAITING' | 'CALLED',
      })),
      tasks: tasks.rows.map(row => ({ ...row, title: row.title ?? '', status: row.status as 'TODO' | 'HELP' })),
      rooms: rooms.rows,
    };
    return {
      generatedAt: new Date().toISOString(),
      ...data,
      counts: {
        queues: data.queues.length,
        called: data.queues.filter(row => row.status === 'CALLED').length,
        tasks: data.tasks.length,
        registrations: data.registrations.length,
        rooms: data.rooms.length,
      },
      truncated: { queues: queues.rowCount === 100, tasks: tasks.rowCount === 100, registrations: registrations.rowCount === 100, rooms: rooms.rowCount === 100 },
    };
  }
}

export class PostgresCommunityRealtimeAccess implements CommunityRealtimeAccess {
  constructor(private readonly pool: Pool) {}

  async canSubscribe(
    actor: { id: string; role: string },
    subscription: CommunityDomainSubscription,
  ): Promise<boolean> {
    if (!actor.id || !['BASIC', 'PROMOTER', 'ADMIN'].includes(actor.role)) return false;
    if ('user' in subscription) return true;
    if ('roomId' in subscription) {
      const result = await this.pool.query(
        `SELECT 1 FROM "FriendsRoomMember" WHERE "roomId" = $1 AND "userId" = $2 LIMIT 1`,
        [subscription.roomId, actor.id],
      );
      return Boolean(result.rowCount);
    }
    if ('eventId' in subscription) {
      const result = await this.pool.query(
        `SELECT 1 FROM events WHERE id = $1 AND status = ANY($2::"EventStatus"[]) LIMIT 1`,
        [subscription.eventId, ['PUBLISHED', 'CANCELLED', 'ENDED']],
      );
      return Boolean(result.rowCount);
    }
    if ('chatEventId' in subscription) {
      const result = await this.pool.query(
        `SELECT 1 FROM events e
          WHERE e.id = $1 AND e.status = 'PUBLISHED'
            AND ($3::text = 'ADMIN' OR e."userId" = $2
              OR EXISTS (SELECT 1 FROM "CommunityTeamMember" t WHERE t."eventId" = e.id AND t."userId" = $2)
              OR EXISTS (SELECT 1 FROM "EventRegistration" r WHERE r."eventId" = e.id
                         AND r."userId" = $2 AND r.status = ANY($4::"RegistrationStatus"[])))
          LIMIT 1`,
        [subscription.chatEventId, actor.id, actor.role, ['CONFIRMED', 'CHECKED_IN']],
      );
      return Boolean(result.rowCount);
    }
    if ('partyEventId' in subscription) {
      const result = await this.pool.query(
        `SELECT 1 FROM events e JOIN "EventRegistration" r ON r."eventId" = e.id
          WHERE e.id = $1 AND e.status = 'PUBLISHED' AND r."userId" = $2
            AND r.status = ANY($3::"RegistrationStatus"[]) LIMIT 1`,
        [subscription.partyEventId, actor.id, ['CONFIRMED', 'CHECKED_IN']],
      );
      return Boolean(result.rowCount);
    }
    const match = subscription as { matchId: string };
    const result = await this.pool.query(
      `SELECT 1
         FROM "PartyMatch" m
         JOIN "PartyProfile" own ON own."eventId" = m."eventId" AND own."userId" = $2 AND own.active = TRUE
         JOIN "PartyProfile" peer ON peer."eventId" = m."eventId"
           AND peer."userId" = CASE WHEN m."userAId" = $2 THEN m."userBId" ELSE m."userAId" END
           AND peer.active = TRUE
         JOIN events e ON e.id = m."eventId" AND e.status = 'PUBLISHED'
        WHERE m.id = $1 AND m.active = TRUE
          AND $2 = ANY(ARRAY[m."userAId", m."userBId"])
          AND EXISTS (SELECT 1 FROM "EventRegistration" r WHERE r."eventId" = m."eventId"
                       AND r."userId" = $2 AND r.status = ANY($3::"RegistrationStatus"[]))
          AND EXISTS (SELECT 1 FROM "EventRegistration" r WHERE r."eventId" = m."eventId"
                       AND r."userId" = peer."userId" AND r.status = ANY($3::"RegistrationStatus"[]))
          AND NOT EXISTS (SELECT 1 FROM "PartyBlock" b
                           WHERE (b."fromId" = $2 AND b."toId" = peer."userId")
                              OR (b."fromId" = peer."userId" AND b."toId" = $2))
        LIMIT 1`,
      [match.matchId, actor.id, ['CONFIRMED', 'CHECKED_IN']],
    );
    return Boolean(result.rowCount);
  }
}
