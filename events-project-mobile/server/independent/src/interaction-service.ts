import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { MobileAuthError } from './auth-service';
import type { Role } from './auth-service';
import type { EventReader } from './event-repository';

const publicStatuses = ['PUBLISHED', 'CANCELLED', 'ENDED'];
const confirmedStatuses = ['CONFIRMED', 'CHECKED_IN'];
const reportReasons = ['INCORRECT_INFORMATION', 'INAPPROPRIATE_CONTENT', 'SPAM', 'OTHER'];
const tokenLifetimeMs = 5 * 60 * 1000;
const retryLimit = 3;
const engagementCapacity = 10_000;

interface EngagementEntry {
  until: number;
  pending?: Promise<void>;
}

interface RegistrationEvent {
  id: string;
  status: string;
  dataInicio: string;
  startTime: string | null;
  timezone: string;
  capacity: number | null;
  userId: string | null;
}

function eventInstant(date: string, time: string | null, timezone: string, fallback = '09:00'): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const clock = time || fallback;
  if (!/^\d{2}:\d{2}$/.test(clock)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = clock.split(':').map(Number);
  let result = Date.UTC(year, month - 1, day, hour, minute);
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    for (let iteration = 0; iteration < 3; iteration++) {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(result))
        .filter(part => part.type !== 'literal')
        .map(part => [part.type, part.value]));
      const represented = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
        Number(parts.second),
      );
      result += Date.UTC(year, month - 1, day, hour, minute) - represented;
    }
    return Number.isNaN(result) ? null : new Date(result);
  } catch {
    return null;
  }
}

function throwAttendance(status: number, message: string): never {
  throw new MobileAuthError(status, message);
}

async function serializable<T>(pool: Pool, operation: (client: PoolClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < retryLimit; attempt++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      if (
        error
        && typeof error === 'object'
        && 'code' in error
        && (error.code === '40001' || error.code === '40P01')
        && attempt < retryLimit - 1
      ) {
        continue;
      }
      throw error;
    } finally {
      client.release();
    }
  }
  return throwAttendance(503, 'Não foi possível concluir a operação. Tente novamente.');
}

async function registrationEvent(client: PoolClient, eventId: string, lock = false): Promise<RegistrationEvent> {
  const result = await client.query(
    `SELECT id, status, "dataInicio", "startTime", timezone, capacity, "userId"
     FROM events WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`,
    [eventId],
  );
  const event = result.rows[0] as RegistrationEvent | undefined;
  if (!event) throwAttendance(404, 'Evento não encontrado.');
  return event;
}

function assertRegistrationOpen(event: RegistrationEvent, now: Date): void {
  const start = eventInstant(event.dataInicio, event.startTime, event.timezone);
  if (event.status !== 'PUBLISHED' || !start || start.getTime() <= now.getTime()) {
    throwAttendance(409, 'As inscrições deste evento estão encerradas.');
  }
}

async function promoteWaiting(client: PoolClient, eventId: string, slots: number): Promise<string[]> {
  if (slots <= 0) return [];
  const result = await client.query(
    `SELECT id, "userId" FROM "EventRegistration"
     WHERE "eventId" = $1 AND status = 'WAITLISTED'
     ORDER BY "createdAt" ASC, id ASC
     LIMIT $2 FOR UPDATE`,
    [eventId, slots],
  );
  const promoted: string[] = [];
  for (const row of result.rows as Array<{ id: string; userId: string }>) {
    await client.query(
      `UPDATE "EventRegistration" SET status = 'CONFIRMED', "updatedAt" = NOW()
       WHERE id = $1`,
      [row.id],
    );
    await client.query(
      `INSERT INTO "Notification" (id, "userId", title, message, href)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), row.userId, 'Sua presença foi confirmada', 'Uma vaga abriu no evento. Sua inscrição foi confirmada.', `/eventos/${eventId}`],
    );
    promoted.push(row.userId);
  }
  return promoted;
}

function cursorValue(value: string | null): { id: string; date: Date } | null {
  if (!value) return null;
  if (value.length > 400) throwAttendance(400, 'Cursor inválido.');
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!decoded || typeof decoded !== 'object' || !('id' in decoded) || !('date' in decoded)) throw new Error('bad cursor');
    const cursor = decoded as { id: unknown; date: unknown };
    const date = typeof cursor.date === 'string' ? new Date(cursor.date) : new Date(NaN);
    if (typeof cursor.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(cursor.id) || !Number.isFinite(date.getTime())) throw new Error('bad cursor');
    return { id: cursor.id, date };
  } catch {
    throwAttendance(400, 'Cursor inválido.');
  }
}

function reportRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    report: {
      id: row.id,
      status: row.status,
    },
  };
}

export class PostgresInteractionService {
  private readonly engagementEntries = new Map<string, EngagementEntry>();

  constructor(
    private readonly pool: Pool,
    private readonly events: EventReader,
    private readonly signingSecret: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (Buffer.byteLength(signingSecret, 'utf8') < 32) {
      throw new Error('Configure MOBILE_AUTH_SECRET com pelo menos 32 bytes.');
    }
  }

  async favoriteState(eventId: string, userId: string | null): Promise<{ saved: boolean; reminderMinutes: number | null }> {
    if (!userId) return { saved: false, reminderMinutes: null };
    const result = await this.pool.query(
      `SELECT "reminderMinutes" FROM "Favorite" WHERE "userId" = $1 AND "eventId" = $2`,
      [userId, eventId],
    );
    return result.rows[0]
      ? { saved: true, reminderMinutes: result.rows[0].reminderMinutes ?? null }
      : { saved: false, reminderMinutes: null };
  }

  async toggleFavorite(eventId: string, userId: string): Promise<Record<string, unknown>> {
    return serializable(this.pool, async client => {
      const event = await client.query(
        `SELECT id FROM events WHERE id = $1 AND status = ANY($2::"EventStatus"[]) FOR UPDATE`,
        [eventId, publicStatuses],
      );
      if (!event.rowCount) throwAttendance(404, 'Evento indisponível.');
      const existing = await client.query(
        `SELECT 1 FROM "Favorite" WHERE "userId" = $1 AND "eventId" = $2`,
        [userId, eventId],
      );
      const wasSaved = Boolean(existing.rowCount);
      if (wasSaved) {
        await client.query(`DELETE FROM "Favorite" WHERE "userId" = $1 AND "eventId" = $2`, [userId, eventId]);
      } else {
        await client.query(`INSERT INTO "Favorite" ("userId", "eventId") VALUES ($1, $2)`, [userId, eventId]);
      }
      return { success: true, message: wasSaved ? 'Evento removido dos salvos.' : 'Evento salvo.', saved: !wasSaved };
    });
  }

  async setReminder(eventId: string, userId: string, minutes: number | null): Promise<Record<string, unknown>> {
    if (minutes !== null && (!Number.isSafeInteger(minutes) || ![15, 60, 1440].includes(minutes))) {
      throwAttendance(400, 'Escolha um dos horários disponíveis.');
    }
    const event = await this.pool.query(
      `SELECT id FROM events WHERE id = $1 AND status = 'PUBLISHED'`,
      [eventId],
    );
    if (!event.rowCount) throwAttendance(409, 'Lembretes estão disponíveis para eventos publicados.');
    await this.pool.query(
      `INSERT INTO "Favorite" ("userId", "eventId", "reminderMinutes", "reminderSentAt")
       VALUES ($1, $2, $3, NULL)
       ON CONFLICT ("userId", "eventId") DO UPDATE
       SET "reminderMinutes" = EXCLUDED."reminderMinutes", "reminderSentAt" = NULL`,
      [userId, eventId, minutes],
    );
    return { success: true, message: minutes === null ? 'Lembrete desativado.' : 'Lembrete configurado.' };
  }

  async favorites(userId: string): Promise<unknown[]> {
    return this.events.listFavoriteEvents(userId);
  }

  async trackEngagement(
    actor: string,
    eventId: string,
    action: 'view' | 'ticket',
  ): Promise<{ success: true }> {
    const now = this.now().getTime();
    for (const [key, entry] of this.engagementEntries) {
      if (!entry.pending && entry.until <= now) this.engagementEntries.delete(key);
    }
    const key = JSON.stringify([actor, eventId, action]);
    const current = this.engagementEntries.get(key);
    if (current?.pending) {
      await current.pending;
      return { success: true };
    }
    if (current && current.until > now) return { success: true };
    if (this.engagementEntries.size >= engagementCapacity && !current) {
      throw new MobileAuthError(503, 'Aguarde antes de tentar novamente.');
    }
    const entry: EngagementEntry = { until: now };
    const pending = this.recordEngagement(eventId, action);
    entry.pending = pending;
    this.engagementEntries.set(key, entry);
    try {
      await pending;
      entry.until = this.now().getTime() + (action === 'view' ? 60 * 60 * 1000 : 60 * 1000);
      delete entry.pending;
      return { success: true };
    } catch (error) {
      this.engagementEntries.delete(key);
      throw error;
    }
  }

  private async recordEngagement(eventId: string, action: 'view' | 'ticket'): Promise<void> {
    const client = await this.pool.connect();
    const day = this.now().toISOString().slice(0, 10);
    const views = action === 'view' ? 1 : 0;
    const ticketClicks = action === 'ticket' ? 1 : 0;
    try {
      await client.query('BEGIN');
      const event = await client.query(
        `SELECT id FROM events WHERE id = $1 AND status = ANY($2::"EventStatus"[])`,
        [eventId, publicStatuses],
      );
      if (!event.rowCount) throwAttendance(404, 'Evento indisponível.');
      await client.query(
        `UPDATE events
         SET views = views + $1, "ticketClicks" = "ticketClicks" + $2
         WHERE id = $3`,
        [views, ticketClicks, eventId],
      );
      await client.query(
        `INSERT INTO "EventMetric" ("eventId", day, views, "ticketClicks")
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ("eventId", day) DO UPDATE
         SET views = "EventMetric".views + EXCLUDED.views,
             "ticketClicks" = "EventMetric"."ticketClicks" + EXCLUDED."ticketClicks"`,
        [eventId, day, views, ticketClicks],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async notificationPage(userId: string, before: string | null, unread: boolean): Promise<Record<string, unknown>> {
    const cursor = cursorValue(before);
    const result = await this.pool.query(
      `SELECT id, title, message, href, "readAt", "createdAt"
       FROM "Notification"
       WHERE "userId" = $1
         AND ($2::boolean = FALSE OR "readAt" IS NULL)
         AND ($3::timestamptz IS NULL OR ("createdAt", id) < ($3::timestamptz, $4::text))
       ORDER BY "createdAt" DESC, id DESC
       LIMIT 51`,
      [userId, unread, cursor?.date ?? null, cursor?.id ?? null],
    );
    const rows = result.rows.slice(0, 50);
    const items = rows.map(row => ({
      ...row,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString(),
      readAt: row.readAt ? (row.readAt instanceof Date ? row.readAt.toISOString() : new Date(row.readAt).toISOString()) : null,
    }));
    const last = rows.at(-1);
    const nextBefore = result.rows.length > 50 && last
      ? Buffer.from(JSON.stringify({
        id: last.id,
        date: last.createdAt instanceof Date ? last.createdAt.toISOString() : new Date(last.createdAt).toISOString(),
      })).toString('base64url')
      : null;
    return { items, nextBefore };
  }

  async markNotificationsRead(userId: string, id: string | null): Promise<{ success: true }> {
    await this.pool.query(
      `UPDATE "Notification" SET "readAt" = $1
       WHERE "userId" = $2 AND "readAt" IS NULL AND ($3::text IS NULL OR id = $3)`,
      [this.now(), userId, id],
    );
    return { success: true };
  }

  async registrationState(eventId: string, userId: string | null): Promise<Record<string, unknown>> {
    const event = await this.pool.query(`SELECT id, capacity FROM events WHERE id = $1`, [eventId]);
    if (!event.rowCount) throwAttendance(404, 'Evento não encontrado.');
    const [confirmed, waiting, registration] = await Promise.all([
      this.pool.query(
        `SELECT COUNT(*)::int AS count FROM "EventRegistration"
         WHERE "eventId" = $1 AND status = ANY($2::"RegistrationStatus"[])`,
        [eventId, confirmedStatuses],
      ),
      this.pool.query(
        `SELECT COUNT(*)::int AS count FROM "EventRegistration" WHERE "eventId" = $1 AND status = 'WAITLISTED'`,
        [eventId],
      ),
      userId
        ? this.pool.query(
          `SELECT id, status, "createdAt", "checkedInAt" FROM "EventRegistration"
           WHERE "eventId" = $1 AND "userId" = $2`,
          [eventId, userId],
        )
        : Promise.resolve({ rows: [] }),
    ]);
    return {
      capacity: event.rows[0].capacity,
      confirmedCount: confirmed.rows[0].count,
      waitingCount: waiting.rows[0].count,
      registration: registration.rows[0] ?? null,
    };
  }

  async registerForEvent(eventId: string, userId: string): Promise<Record<string, unknown>> {
    return serializable(this.pool, async client => {
      const event = await registrationEvent(client, eventId, true);
      assertRegistrationOpen(event, this.now());
      if (event.userId === userId) throwAttendance(409, 'O organizador não pode se inscrever no próprio evento.');
      const existing = await client.query(
        `SELECT id, status FROM "EventRegistration" WHERE "eventId" = $1 AND "userId" = $2 FOR UPDATE`,
        [eventId, userId],
      );
      if (existing.rowCount && existing.rows[0].status !== 'CANCELLED') {
        return { id: existing.rows[0].id, status: existing.rows[0].status };
      }
      const count = await client.query(
        `SELECT COUNT(*)::int AS count FROM "EventRegistration"
         WHERE "eventId" = $1 AND status = ANY($2::"RegistrationStatus"[])`,
        [eventId, confirmedStatuses],
      );
      let confirmed = count.rows[0].count as number;
      if (event.capacity === null || confirmed < event.capacity) {
        const open = event.capacity === null
          ? await client.query(`SELECT COUNT(*)::int AS count FROM "EventRegistration" WHERE "eventId" = $1 AND status = 'WAITLISTED'`, [eventId])
          : { rows: [{ count: Math.max(0, event.capacity - confirmed) }] };
        await promoteWaiting(client, eventId, open.rows[0].count);
        const refreshed = await client.query(
          `SELECT COUNT(*)::int AS count FROM "EventRegistration"
           WHERE "eventId" = $1 AND status = ANY($2::"RegistrationStatus"[])`,
          [eventId, confirmedStatuses],
        );
        confirmed = refreshed.rows[0].count as number;
      }
      const status = event.capacity !== null && confirmed >= event.capacity ? 'WAITLISTED' : 'CONFIRMED';
      if (existing.rowCount) {
        const result = await client.query(
          `UPDATE "EventRegistration"
           SET status = $1, "qrVersion" = "qrVersion" + 1, "checkedInAt" = NULL, "createdAt" = $2, "updatedAt" = $2
           WHERE id = $3 RETURNING id, status`,
          [status, this.now(), existing.rows[0].id],
        );
        return result.rows[0];
      }
      const result = await client.query(
        `INSERT INTO "EventRegistration" ("eventId", "userId", status)
         VALUES ($1, $2, $3) RETURNING id, status`,
        [eventId, userId, status],
      );
      return result.rows[0];
    });
  }

  async cancelRegistration(eventId: string, userId: string): Promise<Record<string, unknown>> {
    return serializable(this.pool, async client => {
      const result = await client.query(
        `SELECT id, status FROM "EventRegistration" WHERE "eventId" = $1 AND "userId" = $2 FOR UPDATE`,
        [eventId, userId],
      );
      const registration = result.rows[0] as { id: string; status: string } | undefined;
      if (!registration || registration.status === 'CANCELLED') return { status: 'CANCELLED', promotedUserId: null };
      if (registration.status === 'CHECKED_IN') throwAttendance(409, 'Uma entrada já validada não pode ser cancelada.');
      await client.query(
        `UPDATE "EventRegistration" SET status = 'CANCELLED', "qrVersion" = "qrVersion" + 1, "updatedAt" = $1 WHERE id = $2`,
        [this.now(), registration.id],
      );
      let promotedUserId: string | null = null;
      if (registration.status === 'CONFIRMED') {
        const event = await registrationEvent(client, eventId, true);
        const start = eventInstant(event.dataInicio, event.startTime, event.timezone);
        if (event.status === 'PUBLISHED' && start && start.getTime() > this.now().getTime()) {
          promotedUserId = (await promoteWaiting(client, eventId, 1))[0] ?? null;
        }
      }
      return { status: 'CANCELLED', promotedUserId };
    });
  }

  async issueCheckInToken(eventId: string, userId: string): Promise<{ token: string; expiresAt: number }> {
    const event = await this.pool.query(`SELECT status FROM events WHERE id = $1`, [eventId]);
    if (!event.rowCount || !['PUBLISHED', 'ENDED'].includes(event.rows[0].status)) {
      throwAttendance(409, 'Check-in indisponível para este evento.');
    }
    const result = await this.pool.query(
      `SELECT id, status, "qrVersion" FROM "EventRegistration" WHERE "eventId" = $1 AND "userId" = $2`,
      [eventId, userId],
    );
    const registration = result.rows[0] as { id: string; status: string; qrVersion: number } | undefined;
    if (!registration || registration.status !== 'CONFIRMED') throwAttendance(403, 'Confirme sua presença para gerar o QR Code.');
    const claims = { registrationId: registration.id, eventId, qrVersion: registration.qrVersion, expiresAt: this.now().getTime() + tokenLifetimeMs };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = createHmac('sha256', this.signingSecret).update(`eventmap-checkin-v1:${payload}`).digest('base64url');
    return { token: `${payload}.${signature}`, expiresAt: claims.expiresAt };
  }

  async checkIn(eventId: string, actor: { id: string; role: Role }, token: string): Promise<Record<string, unknown>> {
    if (token.length > 1000) throwAttendance(400, 'QR Code inválido.');
    const parts = token.split('.');
    if (parts.length !== 2) throwAttendance(400, 'QR Code inválido.');
    const expected = createHmac('sha256', this.signingSecret).update(`eventmap-checkin-v1:${parts[0]}`).digest();
    const actual = Buffer.from(parts[1]);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throwAttendance(400, 'QR Code inválido.');
    let claims: { registrationId: string; eventId: string; qrVersion: number; expiresAt: number };
    try {
      const value: unknown = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      if (!value || typeof value !== 'object' || !('registrationId' in value) || !('eventId' in value) || !('qrVersion' in value) || !('expiresAt' in value)) throw new Error();
      const candidate = value as typeof claims;
      if (
        typeof candidate.registrationId !== 'string'
        || typeof candidate.eventId !== 'string'
        || !Number.isSafeInteger(candidate.qrVersion)
        || !Number.isSafeInteger(candidate.expiresAt)
        || candidate.expiresAt <= this.now().getTime()
      ) throw new Error();
      claims = candidate;
    } catch {
      throwAttendance(400, 'QR Code inválido ou expirado.');
    }
    if (claims.eventId !== eventId) throwAttendance(400, 'QR Code pertence a outro evento.');
    return serializable(this.pool, async client => {
      const event = await registrationEvent(client, eventId, true);
      if (actor.role !== 'ADMIN' && event.userId !== actor.id) throwAttendance(403, 'Acesso negado.');
      if (!['PUBLISHED', 'ENDED'].includes(event.status)) throwAttendance(409, 'Check-in indisponível para este evento.');
      const result = await client.query(
        `SELECT r.id, r.status, r."qrVersion", r."checkedInAt", u.id AS "userId", u.name AS "userName"
         FROM "EventRegistration" r JOIN "User" u ON u.id = r."userId"
         WHERE r.id = $1 AND r."eventId" = $2 FOR UPDATE OF r`,
        [claims.registrationId, eventId],
      );
      const registration = result.rows[0] as { id: string; status: string; qrVersion: number; checkedInAt: Date | null; userId: string; userName: string | null } | undefined;
      if (!registration || registration.qrVersion !== claims.qrVersion) throwAttendance(400, 'QR Code inválido.');
      const user = { id: registration.userId, name: registration.userName };
      if (registration.status === 'CHECKED_IN') return { id: registration.id, status: registration.status, checkedInAt: registration.checkedInAt, user };
      if (registration.status !== 'CONFIRMED') throwAttendance(409, 'Esta inscrição não está confirmada.');
      const changed = await client.query(
        `UPDATE "EventRegistration" SET status = 'CHECKED_IN', "checkedInAt" = $1, "updatedAt" = $1
         WHERE id = $2 RETURNING id, status, "checkedInAt"`,
        [this.now(), registration.id],
      );
      return { ...changed.rows[0], user };
    });
  }

  async checkInRoster(eventId: string, actor: { id: string; role: Role }): Promise<unknown[]> {
    const event = await this.pool.query(`SELECT "userId" FROM events WHERE id = $1`, [eventId]);
    if (!event.rowCount) throwAttendance(404, 'Evento não encontrado.');
    if (actor.role !== 'ADMIN' && event.rows[0].userId !== actor.id) throwAttendance(403, 'Acesso negado.');
    const result = await this.pool.query(
      `SELECT r.id, r.status, r."createdAt", r."checkedInAt",
              u.id AS "userId", u.name AS "userName", u.email AS "userEmail"
       FROM "EventRegistration" r JOIN "User" u ON u.id = r."userId"
       WHERE r."eventId" = $1 AND r.status = ANY($2::"RegistrationStatus"[])
       ORDER BY r."createdAt" ASC, r.id ASC`,
      [eventId, ['CONFIRMED', 'WAITLISTED', 'CHECKED_IN']],
    );
    return result.rows.map(row => ({
      id: row.id,
      status: row.status,
      createdAt: row.createdAt,
      checkedInAt: row.checkedInAt,
      user: { id: row.userId, name: row.userName, email: row.userEmail },
    }));
  }

  async reportEvent(eventId: string, reporterId: string, reason: string, details: string): Promise<{ report: unknown }> {
    if (!reportReasons.includes(reason) || details.trim().length < 5 || details.trim().length > 1000) {
      throwAttendance(400, 'Escolha um motivo e descreva o problema em 5 a 1000 caracteres.');
    }
    const event = await this.pool.query(
      `SELECT id, nome, "userId" FROM events WHERE id = $1 AND status = 'PUBLISHED'`,
      [eventId],
    );
    if (!event.rowCount) throwAttendance(404, 'Evento indisponível para denúncia.');
    if (event.rows[0].userId === reporterId) throwAttendance(403, 'Você não pode denunciar seu próprio evento.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const report = await client.query(
        `INSERT INTO "EventReport" (id, "eventId", "reporterId", reason, details)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, status`,
        [randomUUID(), eventId, reporterId, reason, details.trim()],
      );
      const admins = await client.query(`SELECT id FROM "User" WHERE role = 'ADMIN'`);
      for (const admin of admins.rows as Array<{ id: string }>) {
        await client.query(
          `INSERT INTO "Notification" (id, "userId", title, message, href)
           VALUES ($1, $2, $3, $4, $5)`,
          [randomUUID(), admin.id, 'Nova denúncia de evento', `O evento ${event.rows[0].nome} recebeu uma denúncia.`, '/admin/reports'],
        );
      }
      await client.query('COMMIT');
      return { report: reportRow(report.rows[0]).report };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        throwAttendance(409, 'Você já denunciou este evento. A equipe analisará sua denúncia.');
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
