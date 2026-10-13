import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { MobileAuthError } from './auth-service';
import type { AccessToken, LoginResult, Role } from './auth-service';
import type { VerifiedImpersonationToken } from './impersonation-token';

type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;
type ReportStatus = 'PENDING' | 'RESOLVED' | 'DISMISSED';

export interface AdminUserFilters {
  page?: number;
  q?: string;
  role?: Role | '';
}

export interface AdminQueueFilters {
  page?: number;
  status?: ReportStatus | '';
}

export interface HistoryFilters {
  page?: number;
  eventId?: string;
  q?: string;
}

export interface ImpersonationAuditFilters {
  page?: number;
  q?: string;
}

export interface SuspensionInput {
  action: 'suspend' | 'resume';
  reason: string;
  until?: string | null;
}

export interface ReportReviewInput {
  status: Exclude<ReportStatus, 'PENDING'>;
  resolutionNote?: string;
}

export interface ImpersonationTokenIssuer {
  issue(input: {
    userId: string;
    sessionVersion: number;
    provider: 'credentials' | 'google';
    sessionId: string;
    adminId: string;
    adminSessionVersion: number;
    adminProvider: 'credentials' | 'google';
    expiresAt: Date;
  }): string;
}

const roles = new Set<Role>(['BASIC', 'PROMOTER', 'ADMIN']);
const reportStatuses = new Set<ReportStatus>(['PENDING', 'RESOLVED', 'DISMISSED']);
const pageSize = 20;
const impersonationLifetimeMs = 15 * 60 * 1000;

function invalid(message = 'Confira os campos informados.'): never {
  throw new MobileAuthError(400, message);
}

function missing(message: string): never {
  throw new MobileAuthError(404, message);
}

function forbidden(message = 'Esta operação é reservada a administradores.'): never {
  throw new MobileAuthError(403, message);
}

function pageNumber(value: number | undefined): number {
  if (value === undefined) return 1;
  if (!Number.isInteger(value) || value < 1 || value > 100_000) invalid('Página inválida.');
  return value;
}

function queueStatus(value: ReportStatus | '' | undefined): ReportStatus | null {
  if (!value) return null;
  if (!reportStatuses.has(value)) invalid('Status de denúncia inválido.');
  return value;
}

function roleValue(value: unknown): Role {
  if (typeof value !== 'string' || !roles.has(value as Role)) invalid('Permissão inválida.');
  return value as Role;
}

function text(value: unknown, min: number, max: number, message: string): string {
  if (typeof value !== 'string') invalid(message);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) invalid(message);
  return normalized;
}

async function assertAdmin(database: Queryable, actorId: string, lock = false): Promise<void> {
  const result = await database.query(
    `SELECT role FROM "User" WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [actorId],
  );
  if (result.rows[0]?.role !== 'ADMIN') forbidden();
}

async function transaction<T>(pool: Pool, action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function pagination(page: number, total: number) {
  return { page, pageSize, total: Number(total), totalPages: Math.ceil(Number(total) / pageSize) };
}

async function one<T extends QueryResultRow>(
  database: Queryable,
  sql: string,
  values: unknown[],
  notFoundMessage: string,
): Promise<T> {
  const result: QueryResult<T> = await database.query(sql, values);
  if (!result.rows[0]) missing(notFoundMessage);
  return result.rows[0];
}

export class PostgresAdminService {
  constructor(
    private readonly pool: Pool,
    private readonly now: () => Date = () => new Date(),
    private readonly impersonationTokens?: ImpersonationTokenIssuer,
    private readonly accessToken?: AccessToken,
  ) {}

  async listUsers(actorId: string, filters: AdminUserFilters = {}) {
    await assertAdmin(this.pool, actorId);
    const page = pageNumber(filters.page);
    const query = typeof filters.q === 'string' ? filters.q.trim().slice(0, 200) : '';
    const role = filters.role ? roleValue(filters.role) : null;
    const offset = (page - 1) * pageSize;
    const args: unknown[] = [];
    const where: string[] = [];
    if (query) {
      args.push(`%${query.replace(/[\\%_]/g, '\\$&')}%`);
      where.push(`(u.name ILIKE $${args.length} ESCAPE '\\' OR u.email ILIKE $${args.length} ESCAPE '\\')`);
    }
    if (role) {
      args.push(role);
      where.push(`u.role = $${args.length}`);
    }
    const predicate = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countResult = await this.pool.query(
      `SELECT COUNT(*)::int AS total FROM "User" u ${predicate}`,
      args,
    );
    const userArgs = [...args, pageSize, offset];
    const users = await this.pool.query(
      `SELECT u.id, u.name, u.email, u.image, u.role, u."emailVerified",
              u."suspendedAt", u."suspendedUntil",
              (u."suspendedAt" IS NOT NULL AND
               (u."suspendedUntil" IS NULL OR u."suspendedUntil" > $${userArgs.length + 1})) AS "isSuspended"
       FROM "User" u ${predicate}
       ORDER BY u.id
       LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
      [...userArgs, this.now()],
    );
    const countsResult = await this.pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE role = 'ADMIN')::int AS admins,
              COUNT(*) FILTER (WHERE role = 'PROMOTER')::int AS promoters
       FROM "User"`,
    );
    const total = Number(countResult.rows[0]?.total ?? 0);
    return {
      status: 'success',
      data: users.rows.map((row: Record<string, unknown>) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        image: row.image,
        role: row.role,
        emailVerified: row.emailVerified,
        suspendedAt: row.suspendedAt,
        suspendedUntil: row.suspendedUntil,
        isSuspended: row.isSuspended === true,
      })),
      pagination: pagination(page, total),
      counts: {
        total: Number(countsResult.rows[0]?.total ?? 0),
        admins: Number(countsResult.rows[0]?.admins ?? 0),
        promoters: Number(countsResult.rows[0]?.promoters ?? 0),
      },
    };
  }

  async userEvents(actorId: string, userId: string) {
    await assertAdmin(this.pool, actorId);
    const exists = await this.pool.query(`SELECT 1 FROM "User" WHERE id = $1`, [userId]);
    if (!exists.rows[0]) missing('Conta não encontrada.');
    const result = await this.pool.query(
      `SELECT id, nome, banner, descricao, "dataInicio", "dataFim", status,
              category, "userId", "updatedAt"
       FROM events WHERE "userId" = $1
       ORDER BY "updatedAt" DESC, id`,
      [userId],
    );
    return result.rows;
  }

  async updateUserRole(actorId: string, userId: string, input: { role: unknown }) {
    const role = roleValue(input?.role);
    if (actorId === userId) invalid('Não é possível alterar a própria permissão.');
    return transaction(this.pool, async client => {
      await assertAdmin(client, actorId, true);
      const target = await one<{ id: string; role: string }>(
        client,
        `SELECT id, role FROM "User" WHERE id = $1 FOR UPDATE`,
        [userId],
        'Conta não encontrada.',
      );
      if (target.role === role) return { id: target.id, role };
      const updated = await one<Record<string, unknown>>(
        client,
        `UPDATE "User" SET role = $2
         WHERE id = $1
         RETURNING id, name, email, image, role, "emailVerified"`,
        [userId, role],
        'Conta não encontrada.',
      );
      await client.query(
        `SELECT pg_notify('eventmap_user_role_updated', $1)`,
        [target.id],
      );
      return updated;
    });
  }

  async deleteUser(actorId: string, userId: string): Promise<{ ok: true }> {
    if (actorId === userId) invalid('Não é possível excluir a própria conta de administrador.');
    return transaction(this.pool, async client => {
      await assertAdmin(client, actorId, true);
      const deleted = await client.query(`DELETE FROM "User" WHERE id = $1 RETURNING id`, [userId]);
      if (!deleted.rows[0]) missing('Conta não encontrada.');
      return { ok: true };
    });
  }

  async listAdminEvents(actorId: string) {
    await assertAdmin(this.pool, actorId);
    const result = await this.pool.query(
      `SELECT e.id, e.nome, e.banner, e.carrossel, e.descricao, e."dataInicio",
              e."dataFim", e."linkParaCompra", e.endereco, e."userId", e.validate,
              e."validatedBy", e."validatedAt", e.status, e.category, e."isFree",
              e."priceCents", e.lat, e.lng, e."startTime", e."endTime", e.timezone,
              e."reviewNote", e.views, e."ticketClicks", e."updatedAt", e.capacity,
              jsonb_build_object('id', owner.id, 'name', owner.name, 'email', owner.email) AS "user"
       FROM events e LEFT JOIN "User" owner ON owner.id = e."userId"
       ORDER BY CASE e.status WHEN 'PENDING' THEN 0 WHEN 'CHANGES_REQUESTED' THEN 1 ELSE 2 END,
                e."updatedAt" DESC, e.id`,
    );
    return result.rows;
  }

  async validateEvents(actorId: string, input: { ids: unknown }) {
    const ids = this.eventIds(input?.ids);
    return transaction(this.pool, async client => {
      await assertAdmin(client, actorId, true);
      const rows = await client.query(
        `SELECT id, nome, "userId" FROM events
         WHERE id = ANY($1::text[]) AND status = 'PENDING'
         ORDER BY id FOR UPDATE`,
        [ids],
      );
      if (rows.rows.length !== ids.length) {
        throw new MobileAuthError(409, 'Um ou mais eventos não estão mais aguardando análise.');
      }
      const actor = await one<{ name: string | null }>(
        client,
        `SELECT name FROM "User" WHERE id = $1`,
        [actorId],
        'Conta de administrador não encontrada.',
      );
      const now = this.now();
      for (const event of rows.rows as Array<{ id: string; nome: string; userId: string | null }>) {
        await client.query(
          `UPDATE events SET status = 'PUBLISHED', validate = TRUE, "validatedBy" = $2,
             "validatedAt" = $3, "reviewNote" = NULL, "updatedAt" = $3
           WHERE id = $1`,
          [event.id, actorId, now],
        );
        await client.query(
          `INSERT INTO "EventHistory"
           (id, "eventId", "eventName", "promoterId", "actorId", "actorName", action, "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, 'VALIDATED', $7)`,
          [randomUUID(), event.id, event.nome, event.userId, actorId, actor.name, now],
        );
      }
      return { ok: true, validated: rows.rows.length };
    });
  }

  async requestEventCorrections(actorId: string, eventId: string, input: { reason: unknown }) {
    const reason = text(input?.reason, 5, 2000, 'A orientação deve ter entre 5 e 2000 caracteres.');
    return transaction(this.pool, async client => {
      await assertAdmin(client, actorId, true);
      const event = await one<{ id: string; nome: string; userId: string | null }>(
        client,
        `SELECT id, nome, "userId" FROM events WHERE id = $1 AND status = 'PENDING' FOR UPDATE`,
        [eventId],
        'Evento não está aguardando análise.',
      );
      const actor = await one<{ name: string | null }>(
        client,
        `SELECT name FROM "User" WHERE id = $1`,
        [actorId],
        'Conta de administrador não encontrada.',
      );
      const now = this.now();
      await client.query(
        `UPDATE events SET status = 'CHANGES_REQUESTED', validate = FALSE,
           "validatedBy" = $2, "validatedAt" = $3, "reviewNote" = $4, "updatedAt" = $3
         WHERE id = $1`,
        [eventId, actorId, now, reason],
      );
      await client.query(
        `INSERT INTO "EventHistory"
         (id, "eventId", "eventName", "promoterId", "actorId", "actorName", action, "createdAt", note)
         VALUES ($1, $2, $3, $4, $5, $6, 'CHANGES_REQUESTED', $7, $8)`,
        [randomUUID(), event.id, event.nome, event.userId, actorId, actor.name, now, reason],
      );
      return { ok: true, status: 'CHANGES_REQUESTED', reviewNote: reason };
    });
  }

  async deleteEvents(actorId: string, input: { ids: unknown }) {
    const ids = this.eventIds(input?.ids);
    return transaction(this.pool, async client => {
      await assertAdmin(client, actorId, true);
      const rows = await client.query(
        `SELECT id, nome, "userId" FROM events WHERE id = ANY($1::text[]) ORDER BY id FOR UPDATE`,
        [ids],
      );
      if (rows.rows.length !== ids.length) missing('Um ou mais eventos não foram encontrados.');
      const actor = await one<{ name: string | null }>(
        client,
        `SELECT name FROM "User" WHERE id = $1`,
        [actorId],
        'Conta de administrador não encontrada.',
      );
      const now = this.now();
      for (const event of rows.rows as Array<{ id: string; nome: string; userId: string | null }>) {
        await client.query(
          `INSERT INTO "EventHistory"
           (id, "eventId", "eventName", "promoterId", "actorId", "actorName", action, "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, 'DELETED', $7)`,
          [randomUUID(), event.id, event.nome, event.userId, actorId, actor.name, now],
        );
      }
      await client.query(`DELETE FROM events WHERE id = ANY($1::text[])`, [ids]);
      return { ok: true, deleted: rows.rows.length };
    });
  }

  private eventIds(value: unknown): string[] {
    if (
      !Array.isArray(value)
      || value.length === 0
      || value.length > 100
      || value.some(id => typeof id !== 'string' || !id.trim() || id.length > 200)
      || new Set(value).size !== value.length
    ) invalid('Selecione entre 1 e 100 eventos sem duplicatas.');
    return value as string[];
  }

  async setSuspension(actorId: string, userId: string, input: SuspensionInput) {
    if (!input || (input.action !== 'suspend' && input.action !== 'resume')) invalid();
    const reason = text(input.reason, 5, 1000, 'O motivo deve ter entre 5 e 1000 caracteres.');
    let until: Date | null = null;
    if (input.action === 'suspend' && input.until != null) {
      if (typeof input.until !== 'string') invalid('A data de reativação é inválida.');
      until = new Date(input.until);
      if (!Number.isFinite(until.getTime()) || until <= this.now()) invalid('A data de reativação deve estar no futuro.');
    }
    if (actorId === userId) invalid('Não é possível suspender a própria conta.');
    return transaction(this.pool, async client => {
      await assertAdmin(client, actorId, true);
      const target = await one<{ id: string; role: string }>(
        client,
        `SELECT id, role FROM "User" WHERE id = $1 FOR UPDATE`,
        [userId],
        'Conta não encontrada.',
      );
      if (target.role === 'ADMIN') invalid('Contas de administrador não podem ser suspensas por esta operação.');
      if (input.action === 'suspend') {
        await client.query(
          `UPDATE "User" SET "suspendedAt" = $2, "suspendedUntil" = $3,
             "suspensionReason" = $4, "suspendedById" = $5,
             "sessionVersion" = "sessionVersion" + 1
           WHERE id = $1`,
          [userId, this.now(), until, reason, actorId],
        );
      } else {
        await client.query(
          `UPDATE "User" SET "suspendedAt" = NULL, "suspendedUntil" = NULL,
             "suspensionReason" = NULL, "suspendedById" = NULL,
             "sessionVersion" = "sessionVersion" + 1
           WHERE id = $1`,
          [userId],
        );
      }
      await client.query(
        `INSERT INTO "UserSuspensionAudit" (id, "actorId", "userId", action, reason, until)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), actorId, userId, input.action === 'suspend' ? 'SUSPEND' : 'RESUME', reason, input.action === 'suspend' ? until : null],
      );
      return { ok: true, action: input.action, until };
    });
  }

  async listEventReports(actorId: string, filters: AdminQueueFilters = {}) {
    return this.listReports(actorId, filters, false);
  }

  async listPartyReports(actorId: string, filters: AdminQueueFilters = {}) {
    return this.listReports(actorId, filters, true);
  }

  private async listReports(actorId: string, filters: AdminQueueFilters, party: boolean) {
    await assertAdmin(this.pool, actorId);
    const page = pageNumber(filters.page);
    const status = queueStatus(filters.status) ?? 'PENDING';
    const offset = (page - 1) * pageSize;
    if (party) {
      const [count, reports] = await Promise.all([
        this.pool.query(`SELECT COUNT(*)::int AS total FROM "PartyReport" WHERE status = $1`, [status]),
        this.pool.query(
          `SELECT r.id, r."eventId", r."reporterId", r."targetId", r.reason,
                  r.evidence, r.status, r."createdAt", r."reviewerId", r."reviewedAt",
                  e.id AS "joinedEventId", e.nome AS "eventName",
                  reporter.name AS "reporterName", target.name AS "targetName"
           FROM "PartyReport" r
           JOIN events e ON e.id = r."eventId"
           JOIN "User" reporter ON reporter.id = r."reporterId"
           JOIN "User" target ON target.id = r."targetId"
           WHERE r.status = $1
           ORDER BY r."createdAt" ASC, r.id
           LIMIT $2 OFFSET $3`,
          [status, pageSize, offset],
        ),
      ]);
      return {
        reports: reports.rows.map((row: Record<string, unknown>) => ({
          id: row.id,
          reason: row.reason,
          evidence: row.evidence,
          status: row.status,
          createdAt: row.createdAt,
          eventId: row.eventId,
          event: { id: row.joinedEventId, nome: row.eventName },
          reporter: { id: row.reporterId, name: row.reporterName },
          target: { id: row.targetId, name: row.targetName },
        })),
        pagination: pagination(page, Number(count.rows[0]?.total ?? 0)),
      };
    }
    const [count, reports] = await Promise.all([
      this.pool.query(`SELECT COUNT(*)::int AS total FROM "EventReport" WHERE status = $1`, [status]),
      this.pool.query(
        `SELECT r.id, r."eventId", r."reporterId", r.reason, r.details, r.status,
                r."createdAt", r."reviewedById", r."reviewedAt", r."resolutionNote",
                e.id AS "joinedEventId", e.nome AS "eventName",
                reporter.name AS "reporterName"
         FROM "EventReport" r
         JOIN events e ON e.id = r."eventId"
         JOIN "User" reporter ON reporter.id = r."reporterId"
         WHERE r.status = $1
         ORDER BY r."createdAt" ASC, r.id
         LIMIT $2 OFFSET $3`,
        [status, pageSize, offset],
      ),
    ]);
    return {
      reports: reports.rows.map((row: Record<string, unknown>) => ({
        id: row.id,
        reason: row.reason,
        details: row.details,
        status: row.status,
        createdAt: row.createdAt,
        eventId: row.eventId,
        event: { id: row.joinedEventId, nome: row.eventName },
        reporter: { id: row.reporterId, name: row.reporterName },
        resolutionNote: row.resolutionNote,
      })),
      pagination: pagination(page, Number(count.rows[0]?.total ?? 0)),
    };
  }

  async reviewEventReport(actorId: string, reportId: string, input: ReportReviewInput) {
    return transaction(this.pool, async client => {
      await assertAdmin(client, actorId, true);
      const status = this.reviewStatus(input?.status);
      const note = typeof input.resolutionNote === 'string' ? input.resolutionNote.trim().slice(0, 2000) : null;
      const report = await client.query(
        `UPDATE "EventReport"
         SET status = $2::"ReportStatus", "reviewedById" = $3, "reviewedAt" = $4,
             "resolutionNote" = $5, "updatedAt" = $4
         WHERE id = $1 AND status = 'PENDING'
         RETURNING id, status, "reviewedAt", "resolutionNote"`,
        [reportId, status, actorId, this.now(), note],
      );
      if (!report.rows[0]) {
        const exists = await client.query(`SELECT 1 FROM "EventReport" WHERE id = $1`, [reportId]);
        if (!exists.rows[0]) missing('Denúncia não encontrada.');
        throw new MobileAuthError(409, 'Esta denúncia já foi analisada.');
      }
      return report.rows[0];
    });
  }

  async reviewPartyReport(actorId: string, reportId: string, input: { status: unknown }) {
    return transaction(this.pool, async client => {
      await assertAdmin(client, actorId, true);
      const status = this.reviewStatus(input?.status);
      const report = await client.query(
        `UPDATE "PartyReport"
         SET status = $2, "reviewerId" = $3, "reviewedAt" = $4
         WHERE id = $1 AND status = 'PENDING'
         RETURNING id, status, "reviewedAt"`,
        [reportId, status, actorId, this.now()],
      );
      if (!report.rows[0]) {
        const exists = await client.query(`SELECT 1 FROM "PartyReport" WHERE id = $1`, [reportId]);
        if (!exists.rows[0]) missing('Denúncia não encontrada.');
        throw new MobileAuthError(409, 'Esta denúncia já foi analisada.');
      }
      return report.rows[0];
    });
  }

  private reviewStatus(value: unknown): Exclude<ReportStatus, 'PENDING'> {
    if (value !== 'RESOLVED' && value !== 'DISMISSED') invalid('Status de análise inválido.');
    return value;
  }

  async listEventHistory(actorId: string, filters: HistoryFilters = {}) {
    await assertAdmin(this.pool, actorId);
    const page = pageNumber(filters.page);
    const offset = (page - 1) * pageSize;
    const conditions: string[] = [];
    const args: unknown[] = [];
    if (filters.eventId) {
      args.push(filters.eventId);
      conditions.push(`h."eventId" = $${args.length}`);
    }
    const search = typeof filters.q === 'string' ? filters.q.trim().slice(0, 200) : '';
    if (search) {
      args.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
      conditions.push(`(h."eventName" ILIKE $${args.length} ESCAPE '\\' OR h."actorName" ILIKE $${args.length} ESCAPE '\\' OR h.action::text ILIKE $${args.length} ESCAPE '\\')`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const count = await this.pool.query(
      `SELECT COUNT(*)::int AS total FROM "EventHistory" h ${where}`,
      args,
    );
    const result = await this.pool.query(
      `SELECT h.id, h."eventId", h."eventName", h."promoterId", h."actorId",
              h."actorName", h.action, h."createdAt", h.note
       FROM "EventHistory" h ${where}
       ORDER BY h."createdAt" DESC, h.id
       LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
      [...args, pageSize, offset],
    );
    return {
      status: 'success',
      history: result.rows,
      pagination: pagination(page, Number(count.rows[0]?.total ?? 0)),
    };
  }

  async listImpersonationAudit(actorId: string, filters: ImpersonationAuditFilters = {}) {
    await assertAdmin(this.pool, actorId);
    const page = pageNumber(filters.page);
    const offset = (page - 1) * pageSize;
    const search = typeof filters.q === 'string' ? filters.q.trim().slice(0, 200) : '';
    const args: unknown[] = [];
    let where = '';
    if (search) {
      args.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
      where = `WHERE admin.name ILIKE $1 ESCAPE '\\' OR target.name ILIKE $1 ESCAPE '\\' OR s.reason ILIKE $1 ESCAPE '\\'`;
    }
    const count = await this.pool.query(
      `SELECT COUNT(*)::int AS total
       FROM "ImpersonationSession" s
       LEFT JOIN "User" admin ON admin.id = s."adminAccountId"
       LEFT JOIN "User" target ON target.id = s."userAccountId"
       ${where}`,
      args,
    );
    const result = await this.pool.query(
      `SELECT s.id, COALESCE(admin.name, s."adminId") AS "adminName",
              COALESCE(target.name, s."userId") AS "userName",
              s.reason, s."startedAt",
              CASE WHEN s."endedAt" IS NOT NULL THEN 'ENDED'
                   WHEN s."expiresAt" <= $${args.length + 1} THEN 'EXPIRED'
                   ELSE 'ACTIVE' END AS status,
              s."expiresAt", s."endedAt"
       FROM "ImpersonationSession" s
       LEFT JOIN "User" admin ON admin.id = s."adminAccountId"
       LEFT JOIN "User" target ON target.id = s."userAccountId"
       ${where}
       ORDER BY s."startedAt" DESC, s.id
       LIMIT $${args.length + 2} OFFSET $${args.length + 3}`,
      [...args, this.now(), pageSize, offset],
    );
    return { data: result.rows, pagination: pagination(page, Number(count.rows[0]?.total ?? 0)) };
  }

  async startImpersonation(
    actorId: string,
    userId: string,
    input: { reason: unknown },
    metadata: { ip?: string | null } = {},
    adminProvider: 'credentials' | 'google' = 'credentials',
  ) {
    if (!this.impersonationTokens) {
      throw new MobileAuthError(503, 'Impersonação ainda não foi configurada no servidor.');
    }
    const reason = text(input?.reason, 5, 1000, 'O motivo deve ter entre 5 e 1000 caracteres.');
    if (actorId === userId) invalid('Não é possível acessar a própria conta por impersonação.');
    return transaction(this.pool, async client => {
      await assertAdmin(client, actorId, true);
      const admin = await one<{ id: string; name: string | null; sessionVersion: number }>(
        client,
        `SELECT id, name, "sessionVersion" FROM "User" WHERE id = $1 FOR UPDATE`,
        [actorId],
        'Conta de administrador não encontrada.',
      );
      const target = await one<{
        id: string;
        name: string | null;
        email: string | null;
        image: string | null;
        role: Role;
        emailVerified: boolean | null;
        suspendedAt: Date | null;
        suspendedUntil: Date | null;
        sessionVersion: number;
        provider: 'credentials' | 'google';
      }>(
        client,
        `SELECT u.id, u.name, u.email, u.image, u.role, u."emailVerified", u."suspendedAt",
                u."suspendedUntil", u."sessionVersion",
                CASE WHEN u.password IS NOT NULL THEN 'credentials'
                     WHEN EXISTS (SELECT 1 FROM "Account" a WHERE a."userId" = u.id AND a.provider = 'google')
                     THEN 'google' ELSE 'credentials' END AS provider
         FROM "User" u WHERE u.id = $1 FOR UPDATE`,
        [userId],
        'Conta não encontrada.',
      );
      if (target.role === 'ADMIN') invalid('Não é possível acessar outra conta de administrador.');
      if (target.suspendedAt && (!target.suspendedUntil || target.suspendedUntil > this.now())) {
        invalid('Não é possível acessar uma conta suspensa.');
      }
      const active = await client.query(
        `SELECT id FROM "ImpersonationSession"
         WHERE "adminId" = $1 AND "endedAt" IS NULL AND "expiresAt" > $2
         LIMIT 1 FOR UPDATE`,
        [actorId, this.now()],
      );
      if (active.rows[0]) throw new MobileAuthError(409, 'Já existe uma sessão de suporte ativa.');
      const targetSession = await client.query(
        `SELECT id FROM "ImpersonationSession"
         WHERE "userId" = $1 AND "endedAt" IS NULL AND "expiresAt" > $2
         LIMIT 1 FOR UPDATE`,
        [userId, this.now()],
      );
      if (targetSession.rows[0]) throw new MobileAuthError(409, 'Essa conta já está sendo acessada.');
      const id = randomUUID();
      const startedAt = this.now();
      const expiresAt = new Date(startedAt.getTime() + impersonationLifetimeMs);
      const rotatedAdmin = await one<{ sessionVersion: number }>(
        client,
        `UPDATE "User" SET "sessionVersion" = "sessionVersion" + 1
         WHERE id = $1 AND role = 'ADMIN'
         RETURNING "sessionVersion"`,
        [actorId],
        'Conta de administrador não encontrada.',
      );
      await client.query(
        `INSERT INTO "ImpersonationSession"
         (id, "adminId", "userId", "startedAt", "expiresAt", reason, ip, "adminAccountId", "userAccountId")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $2, $3)`,
        [id, actorId, userId, startedAt, expiresAt, reason, metadata.ip?.slice(0, 100) ?? null],
      );
      const impersonation = {
        id,
        adminId: actorId,
        adminName: admin.name,
        userName: target.name,
        expiresAt: expiresAt.toISOString(),
      };
      const token = this.impersonationTokens!.issue({
        userId,
        sessionVersion: target.sessionVersion,
        provider: target.provider,
        sessionId: id,
        adminId: actorId,
        adminSessionVersion: rotatedAdmin.sessionVersion,
        adminProvider,
        expiresAt,
      });
      const login: {
        token: string;
        expiresAt: string;
        user: LoginResult['user'] & { impersonation: typeof impersonation };
        impersonation: typeof impersonation;
      } = {
        token,
        expiresAt: expiresAt.toISOString(),
        user: {
          id: target.id,
          name: target.name,
          email: target.email,
          image: target.image,
          role: target.role,
          emailVerified: target.emailVerified,
          provider: target.provider,
          impersonation,
        },
        impersonation,
      };
      return login;
    });
  }

  async assertOrdinarySessionAllowed(userId: string): Promise<void> {
    const active = await this.pool.query(
      `SELECT s.id FROM "ImpersonationSession" s
       LEFT JOIN "User" admin ON admin.id = s."adminAccountId"
       WHERE (s."adminId" = $1 OR (s."userId" = $1 AND admin.role = 'ADMIN'))
         AND s."endedAt" IS NULL AND s."expiresAt" > $2
       LIMIT 1`,
      [userId, this.now()],
    );
    if (active.rows[0]) {
      throw new MobileAuthError(403, 'Um administrador está acessando sua conta no momento. Tente novamente em instantes.', 'ACCOUNT_IMPERSONATED');
    }
  }

  async endImpersonationWithToken(claims: VerifiedImpersonationToken): Promise<LoginResult> {
    return this.restoreAdminSession(claims, true);
  }

  async validateImpersonationToken(claims: VerifiedImpersonationToken) {
    const result = await this.pool.query(
      `SELECT s.id, s."expiresAt", s."endedAt",
              admin.id AS "adminId", admin.name AS "adminName", admin.role AS "adminRole",
              admin."sessionVersion" AS "adminSessionVersion",
              admin."suspendedAt" AS "adminSuspendedAt", admin."suspendedUntil" AS "adminSuspendedUntil",
              target.id AS "targetId", target.name AS "userName", target.email AS "userEmail",
              target.image AS "userImage", target.role AS "userRole",
              target."emailVerified" AS "userEmailVerified",
              target."sessionVersion" AS "targetSessionVersion",
              target."suspendedAt" AS "targetSuspendedAt", target."suspendedUntil" AS "targetSuspendedUntil"
       FROM "ImpersonationSession" s
       JOIN "User" admin ON admin.id = s."adminAccountId"
       JOIN "User" target ON target.id = s."userAccountId"
       WHERE s.id = $1 AND s."adminId" = $2 AND s."userId" = $3
       LIMIT 1`,
      [claims.sessionId, claims.adminId, claims.subject],
    );
    const session = result.rows[0] as Record<string, unknown> | undefined;
    if (
      !session
      || session.endedAt
      || !(session.expiresAt instanceof Date)
      || session.expiresAt <= this.now()
      || session.adminRole !== 'ADMIN'
      || session.userRole === 'ADMIN'
      || Number(session.adminSessionVersion) !== claims.adminSessionVersion
      || Number(session.targetSessionVersion) !== claims.sessionVersion
      || (session.adminSuspendedAt && (!session.adminSuspendedUntil || session.adminSuspendedUntil > this.now()))
      || (session.targetSuspendedAt && (!session.targetSuspendedUntil || session.targetSuspendedUntil > this.now()))
    ) {
      throw new MobileAuthError(401, 'Sessão de suporte inválida ou encerrada.');
    }
    return {
      id: String(session.id),
      adminId: String(session.adminId),
      adminName: typeof session.adminName === 'string' ? session.adminName : null,
      userName: typeof session.userName === 'string' ? session.userName : null,
      expiresAt: session.expiresAt.toISOString(),
      user: {
        id: String(session.targetId),
        name: typeof session.userName === 'string' ? session.userName : null,
        email: typeof session.userEmail === 'string' ? session.userEmail : null,
        image: typeof session.userImage === 'string' ? session.userImage : null,
        role: String(session.userRole),
        emailVerified: typeof session.userEmailVerified === 'boolean' ? session.userEmailVerified : null,
        provider: claims.provider,
      },
    };
  }

  async impersonationTokenStatus(claims: VerifiedImpersonationToken) {
    const session = await one<{
      id: string;
      userId: string;
      startedAt: Date;
      expiresAt: Date;
      endedAt: Date | null;
    }>(
      this.pool,
      `SELECT id, "userId", "startedAt", "expiresAt", "endedAt"
       FROM "ImpersonationSession"
       WHERE id = $1 AND "adminId" = $2 AND "userId" = $3`,
      [claims.sessionId, claims.adminId, claims.subject],
      'Sessão de suporte não encontrada.',
    );
    const restoreRequired = Boolean(session.endedAt || session.expiresAt <= this.now());
    return {
      restoreRequired,
      ...(restoreRequired ? { session: await this.restoreAdminSession(claims, false) } : {}),
    };
  }

  private async restoreAdminSession(
    claims: VerifiedImpersonationToken,
    endEarly: boolean,
  ): Promise<LoginResult> {
    if (!this.accessToken) {
      throw new MobileAuthError(503, 'Restauração de sessão ainda não foi configurada no servidor.');
    }
    return transaction(this.pool, async client => {
      const session = await one<{
        id: string;
        expiresAt: Date;
        endedAt: Date | null;
      }>(
        client,
        `SELECT id, "expiresAt", "endedAt" FROM "ImpersonationSession"
         WHERE id = $1 AND "adminId" = $2 AND "userId" = $3 FOR UPDATE`,
        [claims.sessionId, claims.adminId, claims.subject],
        'Sessão de suporte não encontrada.',
      );
      if (!session.endedAt) {
        if (!endEarly && session.expiresAt > this.now()) {
          throw new MobileAuthError(409, 'A sessão de suporte ainda está ativa.');
        }
        await client.query(
          `UPDATE "ImpersonationSession" SET "endedAt" = $2 WHERE id = $1 AND "endedAt" IS NULL`,
          [claims.sessionId, this.now()],
        );
      }
      const admin = await one<{
        id: string;
        name: string | null;
        email: string | null;
        image: string | null;
        role: Role;
        emailVerified: boolean | null;
        sessionVersion: number;
        suspendedAt: Date | null;
        suspendedUntil: Date | null;
      }>(
        client,
        `SELECT id, name, email, image, role, "emailVerified", "sessionVersion",
                "suspendedAt", "suspendedUntil"
         FROM "User" WHERE id = $1 FOR UPDATE`,
        [claims.adminId],
        'Conta de administrador não encontrada.',
      );
      if (
        admin.role !== 'ADMIN'
        || admin.sessionVersion !== claims.adminSessionVersion
        || (admin.suspendedAt && (!admin.suspendedUntil || admin.suspendedUntil > this.now()))
      ) {
        throw new MobileAuthError(401, 'Sessão administrativa revogada. Entre novamente.');
      }
      const rotatedAdmin = await one<{ sessionVersion: number }>(
        client,
        `UPDATE "User" SET "sessionVersion" = "sessionVersion" + 1
         WHERE id = $1 AND "sessionVersion" = $2 AND role = 'ADMIN'
         RETURNING "sessionVersion"`,
        [admin.id, claims.adminSessionVersion],
        'Sessão administrativa já foi restaurada ou revogada.',
      );
      const token = this.accessToken!.issue(admin.id, rotatedAdmin.sessionVersion, claims.adminProvider);
      return {
        token,
        expiresAt: new Date(this.now().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        user: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          image: admin.image,
          role: admin.role,
          emailVerified: admin.emailVerified,
          provider: claims.adminProvider,
        },
      };
    });
  }

  async endImpersonation(actorId: string, sessionId: string) {
    await assertAdmin(this.pool, actorId);
    const result = await this.pool.query(
      `UPDATE "ImpersonationSession" SET "endedAt" = $3
       WHERE id = $1 AND "adminId" = $2 AND "endedAt" IS NULL
       RETURNING id, "adminId", "userId", "endedAt"`,
      [sessionId, actorId, this.now()],
    );
    if (!result.rows[0]) {
      const exists = await this.pool.query(
        `SELECT 1 FROM "ImpersonationSession" WHERE id = $1 AND "adminId" = $2`,
        [sessionId, actorId],
      );
      if (!exists.rows[0]) missing('Sessão de suporte não encontrada.');
      return { ended: false };
    }
    return { ended: true, session: result.rows[0] };
  }

  async impersonationStatus(actorId: string, sessionId: string) {
    await assertAdmin(this.pool, actorId);
    const session = await one<{
      id: string;
      userId: string;
      startedAt: Date;
      expiresAt: Date;
      endedAt: Date | null;
    }>(
      this.pool,
      `SELECT id, "userId", "startedAt", "expiresAt", "endedAt"
       FROM "ImpersonationSession" WHERE id = $1 AND "adminId" = $2`,
      [sessionId, actorId],
      'Sessão de suporte não encontrada.',
    );
    const restoreRequired = Boolean(session.endedAt || session.expiresAt <= this.now());
    return { restoreRequired, impersonation: { ...session, status: session.endedAt ? 'ENDED' : restoreRequired ? 'EXPIRED' : 'ACTIVE' } };
  }
}
