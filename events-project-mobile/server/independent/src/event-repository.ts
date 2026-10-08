import type { Pool } from 'pg';
import type { Role } from './auth-service';

export interface EventReader {
  listPublicEvents(): Promise<unknown[]>;
  listOwnedEvents(userId: string): Promise<unknown[]>;
  listFavoriteEvents(userId: string): Promise<unknown[]>;
  getPublicEvent(eventId: string): Promise<unknown | null>;
  getOwnedEvent(eventId: string, user: { id: string; role: Role }): Promise<unknown | null>;
  getPromoterEvents(promoterId: string): Promise<unknown[]>;
}

interface EventRow extends Record<string, unknown> {
  id: string;
  carrossel: string[] | null;
  validate: boolean | null;
  userId: string | null;
  organizerId: string | null;
  organizerName: string | null;
  organizerImage: string | null;
  validatorId: string | null;
  validatorName: string | null;
  validatorImage: string | null;
}

const eventFields = `
  e.id, e.nome, e.banner, e.carrossel, e.descricao, e."dataInicio", e."dataFim",
  e."linkParaCompra", e.endereco, e."userId", COALESCE(e.validate, FALSE) AS validate,
  e.status, e.category, e."priceCents", e."isFree", e.lat, e.lng, e."startTime",
  e."endTime", e.timezone, e.capacity, e."validatedAt",
  u.id AS "organizerId", u.name AS "organizerName", u.image AS "organizerImage",
  v.id AS "validatorId", v.name AS "validatorName", v.image AS "validatorImage"
`;

function eventFromRow(row: EventRow, includeReviewNote = false): Record<string, unknown> {
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
    ...(includeReviewNote ? { reviewNote: row.reviewNote ?? null } : {}),
  };
}

export class PostgresEventReader implements EventReader {
  constructor(private readonly pool: Pool) {}

  async listPublicEvents(): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT ${eventFields}
       FROM events e
       LEFT JOIN "User" u ON u.id = e."userId"
       LEFT JOIN "User" v ON v.id = e."validatedBy"
       WHERE e.status = 'PUBLISHED'
       ORDER BY e."dataInicio" ASC
       LIMIT 1000`,
    );
    return result.rows.map(row => eventFromRow(row as EventRow));
  }

  async listOwnedEvents(userId: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT ${eventFields}, e."reviewNote"
       FROM events e
       LEFT JOIN "User" u ON u.id = e."userId"
       LEFT JOIN "User" v ON v.id = e."validatedBy"
       WHERE e."userId" = $1
       ORDER BY e."updatedAt" DESC`,
      [userId],
    );
    return result.rows.map(row => eventFromRow(row as EventRow, true));
  }

  async listFavoriteEvents(userId: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT ${eventFields}
       FROM "Favorite" f
       JOIN events e ON e.id = f."eventId"
       LEFT JOIN "User" u ON u.id = e."userId"
       LEFT JOIN "User" v ON v.id = e."validatedBy"
       WHERE f."userId" = $1
         AND e.status = ANY($2::"EventStatus"[])
       ORDER BY f."createdAt" DESC`,
      [userId, ['PUBLISHED', 'CANCELLED', 'ENDED']],
    );
    return result.rows.map(row => eventFromRow(row as EventRow));
  }

  async getPublicEvent(eventId: string): Promise<unknown | null> {
    const result = await this.pool.query(
      `SELECT ${eventFields}
       FROM events e
       LEFT JOIN "User" u ON u.id = e."userId"
       LEFT JOIN "User" v ON v.id = e."validatedBy"
       WHERE e.id = $1 AND e.status = ANY($2::"EventStatus"[])
       LIMIT 1`,
      [eventId, ['PUBLISHED', 'CANCELLED', 'ENDED']],
    );
    const row = result.rows[0] as EventRow | undefined;
    return row ? eventFromRow(row) : null;
  }

  async getOwnedEvent(eventId: string, user: { id: string; role: Role }): Promise<unknown | null> {
    const result = await this.pool.query(
      `SELECT ${eventFields}, e."reviewNote"
       FROM events e
       LEFT JOIN "User" u ON u.id = e."userId"
       LEFT JOIN "User" v ON v.id = e."validatedBy"
       WHERE e.id = $1 AND (e."userId" = $2 OR $3 = 'ADMIN')
       LIMIT 1`,
      [eventId, user.id, user.role],
    );
    const row = result.rows[0] as EventRow | undefined;
    return row ? eventFromRow(row, true) : null;
  }

  async getPromoterEvents(promoterId: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT ${eventFields}
       FROM events e
       LEFT JOIN "User" u ON u.id = e."userId"
       LEFT JOIN "User" v ON v.id = e."validatedBy"
       WHERE e."userId" = $1 AND e.status = ANY($2::"EventStatus"[])
       ORDER BY e."dataInicio" DESC`,
      [promoterId, ['PUBLISHED', 'ENDED']],
    );
    return result.rows.map(row => eventFromRow(row as EventRow));
  }
}
