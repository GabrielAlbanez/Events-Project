import type { Pool } from 'pg';
import { MobileAuthError } from './auth-service';
import type { Role } from './auth-service';

export interface EventReadActor {
  id: string;
  role: Role;
}

export interface IcsResponse {
  status: 200;
  contentType: 'text/calendar; charset=utf-8';
  headers: {
    'Content-Disposition': string;
    'Cache-Control': 'private, no-store';
  };
  body: string;
}

interface EventRecord extends Record<string, unknown> {
  id: string;
  nome: string;
  status: string;
  userId: string | null;
  dataInicio: string;
  dataFim: string;
  startTime: string | null;
  endTime: string | null;
  timezone: string;
}

interface ActorRecord {
  id: string;
  role: Role;
}

const visibleStatuses = ['PUBLISHED', 'CANCELLED', 'ENDED'];

function notFound(): never {
  throw new MobileAuthError(404, 'Evento não encontrado.');
}

async function authorizeActor(pool: Pool, actor: EventReadActor): Promise<ActorRecord> {
  if (!actor || typeof actor.id !== 'string' || !actor.id) {
    throw new MobileAuthError(401, 'Entre na sua conta para continuar.');
  }
  const result = await pool.query(
    `SELECT id, role FROM "User" WHERE id = $1`,
    [actor.id],
  );
  const record = result.rows[0] as ActorRecord | undefined;
  if (!record || record.role !== actor.role) throw new MobileAuthError(403, 'Acesso negado.');
  return record;
}

function eventResponse(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    nome: row.nome,
    banner: row.banner,
    carrossel: Array.isArray(row.carrossel) ? row.carrossel : [],
    descricao: row.descricao,
    dataInicio: row.dataInicio,
    dataFim: row.dataFim,
    linkParaCompra: row.linkParaCompra,
    endereco: row.endereco,
    userId: row.userId,
    validate: row.validate ?? false,
    status: row.status,
    category: row.category,
    priceCents: row.priceCents,
    isFree: row.isFree,
    lat: row.lat,
    lng: row.lng,
    startTime: row.startTime,
    endTime: row.endTime,
    timezone: row.timezone,
    capacity: row.capacity,
    validatedAt: row.validatedAt,
    reviewNote: row.reviewNote ?? null,
    user: row.organizerId ? {
      id: row.organizerId,
      name: row.organizerName,
      image: row.organizerImage,
    } : null,
    validator: row.validatorId ? {
      id: row.validatorId,
      name: row.validatorName,
      image: row.validatorImage,
    } : null,
  };
}

function escapeIcs(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function foldIcsLine(line: string): string {
  const chunks: string[] = [];
  let current = '';
  let bytes = 0;
  for (const character of line) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (bytes + characterBytes > 75) {
      chunks.push(current);
      current = ` ${character}`;
      bytes = 1 + characterBytes;
    } else {
      current += character;
      bytes += characterBytes;
    }
  }
  chunks.push(current);
  return chunks.join('\r\n');
}

function icsDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new MobileAuthError(500, 'As datas deste evento não permitem gerar o calendário.');
  }
  if (new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date) {
    throw new MobileAuthError(500, 'As datas deste evento não permitem gerar o calendário.');
  }
  return date.replace(/-/g, '');
}

function nextDate(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function calendarBody(event: EventRecord, generatedAt: Date): string {
  const startDate = icsDate(event.dataInicio);
  const endDate = icsDate(event.dataFim);
  const timezone = event.timezone || 'America/Sao_Paulo';
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
  } catch {
    throw new MobileAuthError(500, 'O fuso horário deste evento não permite gerar o calendário.');
  }
  const validClock = (value: string | null): value is string =>
    typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  const timed = typeof event.startTime === 'string'
    && validClock(event.startTime)
    && validClock(event.endTime);
  const start = timed
    ? `DTSTART;TZID=${timezone}:${startDate}T${event.startTime!.replace(':', '')}00`
    : `DTSTART;VALUE=DATE:${startDate}`;
  let end: string;
  if (timed) {
    end = `DTEND;TZID=${timezone}:${endDate}T${event.endTime!.replace(':', '')}00`;
  } else {
    // The event form stores an inclusive last date; ICS all-day DTEND is exclusive.
    end = `DTEND;VALUE=DATE:${icsDate(nextDate(event.dataFim))}`;
  }
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EventMap//Mobile API//PT-BR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${escapeIcs(event.id)}@eventmap`,
    `DTSTAMP:${generatedAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    start,
    end,
    `SUMMARY:${escapeIcs(event.nome)}`,
    `DESCRIPTION:${escapeIcs(String(event.descricao ?? ''))}`,
    `LOCATION:${escapeIcs(String(event.endereco ?? ''))}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

export class PostgresEventReadCalendarService {
  constructor(private readonly pool: Pool, private readonly now: () => Date = () => new Date()) {}

  async read(eventId: string, actor: EventReadActor | null = null): Promise<Record<string, unknown>> {
    const result = await this.pool.query(
      `SELECT e.*,
              u.id AS "organizerId", u.name AS "organizerName", u.image AS "organizerImage",
              v.id AS "validatorId", v.name AS "validatorName", v.image AS "validatorImage"
       FROM events e
       LEFT JOIN "User" u ON u.id = e."userId"
       LEFT JOIN "User" v ON v.id = e."validatedBy"
       WHERE e.id = $1
       LIMIT 1`,
      [eventId],
    );
    const row = result.rows[0] as EventRecord | undefined;
    if (!row) return notFound();
    if (!visibleStatuses.includes(row.status)) {
      if (!actor) return notFound();
      const user = await authorizeActor(this.pool, actor);
      if (user.role !== 'ADMIN' && row.userId !== user.id) return notFound();
    }
    return eventResponse(row);
  }

  async history(actor: EventReadActor, limit = 200): Promise<{ history: unknown[] }> {
    const user = await authorizeActor(this.pool, actor);
    const safeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 500)) : 200;
    const result = user.role === 'ADMIN'
      ? await this.pool.query(
        `SELECT id, "eventId", "eventName", "promoterId", "actorId", "actorName",
                action, "createdAt", note
         FROM "EventHistory" ORDER BY "createdAt" DESC, id DESC LIMIT $1`,
        [safeLimit],
      )
      : await this.pool.query(
        `SELECT id, "eventId", "eventName", "promoterId", "actorId", "actorName",
                action, "createdAt", note
         FROM "EventHistory" WHERE "promoterId" = $1
         ORDER BY "createdAt" DESC, id DESC LIMIT $2`,
        [user.id, safeLimit],
      );
    return { history: result.rows };
  }

  async eventHistory(actor: EventReadActor, eventId: string): Promise<{ history: unknown[] }> {
    const user = await authorizeActor(this.pool, actor);
    const event = await this.pool.query(
      `SELECT id FROM events WHERE id = $1 AND ("userId" = $2 OR $3 = 'ADMIN')`,
      [eventId, user.id, user.role],
    );
    if (!event.rowCount) return notFound();
    const result = await this.pool.query(
      `SELECT id, action, "createdAt", note, "actorName"
       FROM "EventHistory" WHERE "eventId" = $1
       ORDER BY "createdAt" ASC, id ASC`,
      [eventId],
    );
    return { history: result.rows };
  }

  async calendar(eventId: string, actor: EventReadActor | null = null): Promise<IcsResponse> {
    const result = await this.pool.query(
      `SELECT id, nome, descricao, endereco, status, "userId", "dataInicio", "dataFim",
              "startTime", "endTime", timezone
       FROM events WHERE id = $1 LIMIT 1`,
      [eventId],
    );
    const event = result.rows[0] as EventRecord | undefined;
    if (!event) return notFound();
    if (!visibleStatuses.includes(event.status)) {
      if (!actor) return notFound();
      const user = await authorizeActor(this.pool, actor);
      if (user.role !== 'ADMIN' && event.userId !== user.id) return notFound();
    }
    const filename = `event-${event.id.replace(/[^a-zA-Z0-9_-]/g, '')}.ics`;
    return {
      status: 200,
      contentType: 'text/calendar; charset=utf-8',
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
      body: calendarBody(event, this.now()),
    };
  }
}
