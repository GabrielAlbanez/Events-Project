import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { MobileAuthError } from './auth-service';
import type { Role } from './auth-service';

export interface EventActor {
  id: string;
  role: Role;
}

export interface EventAuthoringInput {
  nome: string;
  banner: string;
  carrossel?: string[];
  descricao: string;
  dataInicio: string;
  dataFim: string;
  endereco: string;
  linkParaCompra: string;
  category?: string;
  isFree: boolean;
  priceCents: number;
  capacity?: number | null;
  lat?: number | null;
  lng?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string;
}

interface NormalizedEvent {
  nome: string;
  banner: string;
  carrossel: string[];
  descricao: string;
  dataInicio: string;
  dataFim: string;
  endereco: string;
  linkParaCompra: string;
  category: string;
  isFree: boolean;
  priceCents: number;
  capacity: number | null;
  lat: number | null;
  lng: number | null;
  startTime: string | null;
  endTime: string | null;
  timezone: string;
}

interface EventRow extends Record<string, unknown> {
  id: string;
  nome: string;
  status: string;
  userId: string | null;
  recurrenceSeriesId: string | null;
}

interface ActorRow {
  id: string;
  name: string | null;
  role: Role;
}

function badRequest(message: string): never {
  throw new MobileAuthError(400, message);
}

function forbidden(): never {
  throw new MobileAuthError(403, 'Acesso negado.');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredText(input: Record<string, unknown>, key: string, maxLength: number): string {
  const value = input[key];
  if (typeof value !== 'string') return badRequest('Confira os campos informados.');
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return badRequest('Confira os campos informados.');
  return normalized;
}

function optionalText(input: Record<string, unknown>, key: string, fallback: string | null, maxLength: number): string | null {
  const value = input[key];
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return badRequest('Confira os campos informados.');
  const normalized = value.trim();
  if (normalized.length > maxLength) return badRequest('Confira os campos informados.');
  return normalized || fallback;
}

function integerValue(value: unknown, allowNull: boolean): number | null {
  if (allowNull && (value === undefined || value === null || value === '')) return null;
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) ? parsed : NaN;
}

function decimalValue(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : NaN;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeEvent(
  value: unknown,
  existingMedia?: { banner: string; carrossel: string[] },
): NormalizedEvent {
  if (!isObject(value)) return badRequest('Confira os campos informados.');
  const nome = requiredText(value, 'nome', 160);
  const banner = value.banner === undefined && existingMedia
    ? existingMedia.banner
    : requiredText(value, 'banner', 2048);
  const descricao = requiredText(value, 'descricao', 10_000);
  const dataInicio = requiredText(value, 'dataInicio', 10);
  const dataFim = requiredText(value, 'dataFim', 10);
  const endereco = requiredText(value, 'endereco', 500);
  const linkParaCompra = optionalText(value, 'linkParaCompra', '', 2048) ?? '';
  const category = optionalText(value, 'category', 'Outros', 80) ?? 'Outros';
  if (!validDate(dataInicio) || !validDate(dataFim) || dataFim < dataInicio) {
    return badRequest('Informe datas válidas e um término igual ou posterior ao início.');
  }

  if (linkParaCompra) {
    try {
      const url = new URL(linkParaCompra);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('unsupported');
    } catch {
      return badRequest('Use um link de compra http ou https.');
    }
  }

  const free = booleanValue(value.isFree);
  const priceCents = integerValue(value.priceCents, false);
  const capacity = integerValue(value.capacity, true);
  const lat = decimalValue(value.lat);
  const lng = decimalValue(value.lng);
  if (
    free === null
    || priceCents === null
    || Number.isNaN(priceCents)
    || priceCents < 0
    || (capacity !== null && (Number.isNaN(capacity) || capacity < 1))
    || (lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90))
    || (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180))
    || (free && priceCents !== 0)
  ) {
    return badRequest('Confira preço, capacidade e localização.');
  }
  const carrossel = value.carrossel === undefined ? (existingMedia?.carrossel ?? []) : value.carrossel;
  if (
    !Array.isArray(carrossel)
    || carrossel.length > 10
    || carrossel.some(item => typeof item !== 'string' || !item.trim() || item.length > 2048)
  ) {
    return badRequest('Selecione até 10 imagens válidas para o carrossel.');
  }
  const startTime = optionalText(value, 'startTime', null, 5);
  const endTime = optionalText(value, 'endTime', null, 5);
  if ((startTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime))
    || (endTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(endTime))) {
    return badRequest('Informe horários válidos no formato HH:MM.');
  }
  const timezone = optionalText(value, 'timezone', 'America/Sao_Paulo', 100) ?? 'America/Sao_Paulo';
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
  } catch {
    return badRequest('Informe um fuso horário válido.');
  }

  return {
    nome,
    banner,
    carrossel: carrossel.map(item => (item as string).trim()),
    descricao,
    dataInicio,
    dataFim,
    endereco,
    linkParaCompra,
    category,
    isFree: free,
    priceCents,
    capacity: Number.isNaN(capacity) ? null : capacity,
    lat: Number.isNaN(lat) ? null : lat,
    lng: Number.isNaN(lng) ? null : lng,
    startTime: startTime || null,
    endTime: endTime || null,
    timezone,
  };
}

function eventValues(event: NormalizedEvent): unknown[] {
  return [
    event.nome, event.banner, event.carrossel, event.descricao, event.dataInicio, event.dataFim,
    event.linkParaCompra, event.endereco, event.category, event.isFree, event.priceCents,
    event.lat, event.lng, event.startTime, event.endTime, event.timezone, event.capacity,
  ];
}

async function transaction<T>(pool: Pool, operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Keep the original database or validation error.
    }
    throw error;
  } finally {
    client.release();
  }
}

async function actorRow(client: PoolClient, actor: EventActor): Promise<ActorRow> {
  if (!actor || typeof actor.id !== 'string' || !actor.id) return forbidden();
  const result = await client.query(
    `SELECT id, name, role FROM "User" WHERE id = $1 FOR SHARE`,
    [actor.id],
  );
  const row = result.rows[0] as ActorRow | undefined;
  if (!row || row.role !== actor.role) return forbidden();
  return row;
}

async function requirePromoter(client: PoolClient, actor: EventActor): Promise<ActorRow> {
  const row = await actorRow(client, actor);
  if (row.role !== 'PROMOTER' && row.role !== 'ADMIN') return forbidden();
  return row;
}

async function requireAdmin(client: PoolClient, actor: EventActor): Promise<ActorRow> {
  const row = await actorRow(client, actor);
  if (row.role !== 'ADMIN') return forbidden();
  return row;
}

async function ownedEvent(client: PoolClient, eventId: string, actor: EventActor): Promise<EventRow> {
  const result = await client.query(
    `SELECT * FROM events
     WHERE id = $1 AND ("userId" = $2 OR $3 = 'ADMIN')
     FOR UPDATE`,
    [eventId, actor.id, actor.role],
  );
  const row = result.rows[0] as EventRow | undefined;
  if (!row) throw new MobileAuthError(404, 'Evento não encontrado.');
  return row;
}

async function writeHistory(
  client: PoolClient,
  event: Pick<EventRow, 'id' | 'nome' | 'userId'>,
  actor: ActorRow,
  action: 'CREATED' | 'VALIDATED' | 'DELETED' | 'UPDATED' | 'CHANGES_REQUESTED' | 'CANCELLED' | 'SUBMITTED' | 'DUPLICATED',
  note: string | null = null,
): Promise<void> {
  await client.query(
    `INSERT INTO "EventHistory"
      (id, "eventId", "eventName", "promoterId", "actorId", "actorName", action, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [randomUUID(), event.id, event.nome, event.userId, actor.id, actor.name, action, note],
  );
}

function savedEvent(row: Record<string, unknown>, message: string): Record<string, unknown> {
  return { success: true, message, evento: row, id: row.id };
}

function shiftedDate(value: string, frequency: 'WEEKLY' | 'MONTHLY', interval: number, index: number): string {
  const [year, month, day] = value.split('-').map(Number);
  if (frequency === 'WEEKLY') {
    const date = new Date(Date.UTC(year, month - 1, day + (7 * interval * index)));
    return date.toISOString().slice(0, 10);
  }
  const targetMonthIndex = month - 1 + interval * index;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex % 12;
  const finalDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, finalDay))).toISOString().slice(0, 10);
}

export class PostgresEventAuthoringService {
  constructor(private readonly pool: Pool) {}

  async create(actor: EventActor, input: unknown, submit = true): Promise<Record<string, unknown>> {
    const event = normalizeEvent(input);
    return transaction(this.pool, async client => {
      const author = await requirePromoter(client, actor);
      const id = randomUUID();
      const status = submit ? 'PENDING' : 'DRAFT';
      const sql = `INSERT INTO events
        ("id", "nome", "banner", "carrossel", "descricao", "dataInicio", "dataFim",
         "linkParaCompra", "endereco", "userId", "validate", "status", "category",
         "isFree", "priceCents", "lat", "lng", "startTime", "endTime", "timezone", "capacity")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, FALSE, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        RETURNING *`;
      const result = await client.query(sql, [id, ...eventValues(event).slice(0, 8), actor.id, status, ...eventValues(event).slice(8)]);
      const row = result.rows[0] as EventRow;
      await writeHistory(client, row, author, 'CREATED');
      if (submit) await writeHistory(client, row, author, 'SUBMITTED');
      return savedEvent(row, submit ? 'Evento enviado para análise.' : 'Rascunho salvo.');
    });
  }

  async update(actor: EventActor, eventId: string, input: unknown, submit = true): Promise<Record<string, unknown>> {
    return transaction(this.pool, async client => {
      const author = await requirePromoter(client, actor);
      const existing = await ownedEvent(client, eventId, actor);
      if (existing.status === 'CANCELLED' || existing.status === 'ENDED') {
        throw new MobileAuthError(409, 'Este evento não pode mais ser editado.');
      }
      const event = normalizeEvent(input, {
        banner: String(existing.banner),
        carrossel: Array.isArray(existing.carrossel) ? existing.carrossel : [],
      });
      const status = submit ? 'PENDING' : 'DRAFT';
      const result = await client.query(
        `UPDATE events SET
           "nome" = $1, "banner" = $2, "carrossel" = $3, "descricao" = $4,
           "dataInicio" = $5, "dataFim" = $6, "linkParaCompra" = $7, "endereco" = $8,
           "category" = $9, "isFree" = $10, "priceCents" = $11, "capacity" = $12,
           "lat" = $13, "lng" = $14, "startTime" = $15, "endTime" = $16,
           "timezone" = $17, "status" = $18, "validate" = FALSE, "validatedBy" = NULL,
           "validatedAt" = NULL, "reviewNote" = NULL, "updatedAt" = NOW()
         WHERE id = $19 RETURNING *`,
        [...eventValues(event), status, eventId],
      );
      const row = result.rows[0] as EventRow;
      await writeHistory(client, row, author, 'UPDATED');
      if (submit) await writeHistory(client, row, author, 'SUBMITTED');
      return savedEvent(row, submit ? 'Evento enviado para análise.' : 'Rascunho atualizado.');
    });
  }

  async cancel(actor: EventActor, eventId: string): Promise<Record<string, unknown>> {
    return transaction(this.pool, async client => {
      const author = await requirePromoter(client, actor);
      const event = await ownedEvent(client, eventId, actor);
      if (event.status === 'CANCELLED' || event.status === 'ENDED') {
        throw new MobileAuthError(409, 'Este evento já foi encerrado ou cancelado.');
      }
      const result = await client.query(
        `UPDATE events SET status = 'CANCELLED', "updatedAt" = NOW()
         WHERE id = $1 RETURNING *`,
        [eventId],
      );
      const row = result.rows[0] as EventRow;
      const registrations = await client.query(
        `SELECT "userId" FROM "EventRegistration"
         WHERE "eventId" = $1 AND status = ANY($2::"RegistrationStatus"[])`,
        [eventId, ['CONFIRMED', 'WAITLISTED', 'CHECKED_IN']],
      );
      for (const registration of registrations.rows as Array<{ userId: string }>) {
        await client.query(
          `INSERT INTO "Notification" (id, "userId", title, message, href)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            randomUUID(),
            registration.userId,
            'Evento cancelado',
            `O evento "${row.nome}" foi cancelado pelo organizador.`,
            `/events/${encodeURIComponent(eventId)}`,
          ],
        );
      }
      await writeHistory(client, row, author, 'CANCELLED');
      return savedEvent(row, 'Evento cancelado.');
    });
  }

  async duplicate(actor: EventActor, eventId: string): Promise<Record<string, unknown>> {
    return transaction(this.pool, async client => {
      const author = await requirePromoter(client, actor);
      const original = await ownedEvent(client, eventId, actor);
      if (original.status === 'CANCELLED') {
        throw new MobileAuthError(409, 'Não é possível duplicar um evento cancelado.');
      }
      const id = randomUUID();
      const result = await client.query(
        `INSERT INTO events
          ("id", "nome", "banner", "carrossel", "descricao", "dataInicio", "dataFim",
           "linkParaCompra", "endereco", "userId", "validate", "status", "category",
           "isFree", "priceCents", "lat", "lng", "startTime", "endTime", "timezone", "capacity")
         SELECT $1, "nome", "banner", "carrossel", "descricao", "dataInicio", "dataFim",
           "linkParaCompra", "endereco", "userId", FALSE, 'DRAFT', "category",
           "isFree", "priceCents", "lat", "lng", "startTime", "endTime", "timezone", "capacity"
         FROM events WHERE id = $2 RETURNING *`,
        [id, eventId],
      );
      const row = result.rows[0] as EventRow;
      await writeHistory(client, row, author, 'DUPLICATED', `Duplicado do evento ${eventId}.`);
      return savedEvent(row, 'Evento duplicado como rascunho.');
    });
  }

  async createRecurrence(
    actor: EventActor,
    eventId: string,
    input: unknown,
  ): Promise<{ success: true; seriesId: string; created: number; ids: string[] }> {
    if (!isObject(input) || (input.frequency !== 'WEEKLY' && input.frequency !== 'MONTHLY')) {
      return badRequest('Escolha uma frequência semanal ou mensal.');
    }
    const interval = integerValue(input.interval, false);
    const count = integerValue(input.count, false);
    if (
      interval === null || Number.isNaN(interval) || interval < 1 || interval > 4
      || count === null || Number.isNaN(count) || count < 2 || count > 52
    ) {
      return badRequest('Use um intervalo de 1 a 4 e crie de 2 a 52 novas ocorrências.');
    }
    const frequency = input.frequency;
    return transaction(this.pool, async client => {
      const author = await requirePromoter(client, actor);
      const original = await ownedEvent(client, eventId, actor);
      if (original.status === 'CANCELLED' || original.status === 'ENDED' || original.recurrenceSeriesId) {
        throw new MobileAuthError(409, 'Este evento não pode iniciar uma nova recorrência.');
      }
      const base = normalizeEvent(original);
      const seriesId = randomUUID();
      await client.query(
        `INSERT INTO "EventSeries" (id, "ownerId", frequency, interval, count, timezone)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [seriesId, actor.id, frequency, interval, count + 1, base.timezone],
      );
      await client.query(
        `UPDATE events SET "recurrenceSeriesId" = $1, "recurrenceIndex" = 0, "updatedAt" = NOW()
         WHERE id = $2`,
        [seriesId, eventId],
      );
      const ids = [eventId];
      for (let index = 1; index <= count; index++) {
        const id = randomUUID();
        const occurrence: NormalizedEvent = {
          ...base,
          dataInicio: shiftedDate(base.dataInicio, frequency, interval, index),
          dataFim: shiftedDate(base.dataFim, frequency, interval, index),
        };
        const values = eventValues(occurrence);
        const result = await client.query(
          `INSERT INTO events
            ("id", "nome", "banner", "carrossel", "descricao", "dataInicio", "dataFim",
             "linkParaCompra", "endereco", "userId", "validate", "status", "category",
             "isFree", "priceCents", "lat", "lng", "startTime", "endTime", "timezone",
             "capacity", "recurrenceSeriesId", "recurrenceIndex")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, FALSE, 'DRAFT',
             $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
           RETURNING *`,
          [id, ...values.slice(0, 8), actor.id, ...values.slice(8), seriesId, index],
        );
        const row = result.rows[0] as EventRow;
        ids.push(id);
        await writeHistory(client, row, author, 'DUPLICATED', `Ocorrência ${index + 1} da recorrência ${seriesId}.`);
      }
      return { success: true, seriesId, created: count, ids };
    });
  }

  async listAdminEvents(actor: EventActor): Promise<unknown[]> {
    return transaction(this.pool, async client => {
      await requireAdmin(client, actor);
      const result = await client.query(
        `SELECT e.*, u.id AS "organizerId", u.name AS "organizerName", u.image AS "organizerImage",
                v.id AS "validatorId", v.name AS "validatorName", v.image AS "validatorImage"
         FROM events e
         LEFT JOIN "User" u ON u.id = e."userId"
         LEFT JOIN "User" v ON v.id = e."validatedBy"
         ORDER BY e."updatedAt" DESC`,
      );
      return result.rows.map(raw => {
        const row = raw as Record<string, unknown>;
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
      });
    });
  }

  async history(actor: EventActor, eventId: string): Promise<{ history: unknown[] }> {
    return transaction(this.pool, async client => {
      const user = await actorRow(client, actor);
      const event = await client.query(
        `SELECT id FROM events WHERE id = $1 AND ("userId" = $2 OR $3 = 'ADMIN')`,
        [eventId, user.id, user.role],
      );
      if (!event.rowCount) throw new MobileAuthError(404, 'Evento não encontrado.');
      const result = await client.query(
        `SELECT id, action, "createdAt", note, "actorName"
         FROM "EventHistory" WHERE "eventId" = $1
         ORDER BY "createdAt" ASC, id ASC`,
        [eventId],
      );
      return { history: result.rows };
    });
  }

  async validate(actor: EventActor, idsInput: unknown): Promise<{ success: true; validatedIds: string[] }> {
    const ids = normalizeIds(idsInput);
    return transaction(this.pool, async client => {
      const admin = await requireAdmin(client, actor);
      const selected = await client.query(
        `SELECT id, nome, "userId", status FROM events WHERE id = ANY($1::text[]) FOR UPDATE`,
        [ids],
      );
      if (selected.rowCount !== ids.length) throw new MobileAuthError(404, 'Um ou mais eventos não foram encontrados.');
      if (selected.rows.some(row => row.status !== 'PENDING')) {
        throw new MobileAuthError(409, 'Apenas eventos em análise podem ser aprovados.');
      }
      for (const row of selected.rows as Array<EventRow>) {
        await client.query(
          `UPDATE events SET status = 'PUBLISHED', "validate" = TRUE, "validatedBy" = $1,
             "validatedAt" = NOW(), "reviewNote" = NULL, "updatedAt" = NOW()
           WHERE id = $2`,
          [admin.id, row.id],
        );
        await writeHistory(client, row, admin, 'VALIDATED');
      }
      return { success: true, validatedIds: ids };
    });
  }

  async requestCorrection(actor: EventActor, eventId: string, input: unknown): Promise<Record<string, unknown>> {
    if (!isObject(input) || typeof input.reason !== 'string') return badRequest('Informe as correções solicitadas.');
    const reason = input.reason.trim();
    if (reason.length < 5 || reason.length > 1000) return badRequest('A orientação deve ter entre 5 e 1000 caracteres.');
    return transaction(this.pool, async client => {
      const admin = await requireAdmin(client, actor);
      const result = await client.query(
        `SELECT * FROM events WHERE id = $1 FOR UPDATE`,
        [eventId],
      );
      const event = result.rows[0] as EventRow | undefined;
      if (!event) throw new MobileAuthError(404, 'Evento não encontrado.');
      if (event.status !== 'PENDING') throw new MobileAuthError(409, 'Apenas eventos em análise podem receber correções.');
      const updated = await client.query(
        `UPDATE events SET status = 'CHANGES_REQUESTED', "validate" = FALSE,
           "validatedBy" = NULL, "validatedAt" = NULL, "reviewNote" = $1, "updatedAt" = NOW()
         WHERE id = $2 RETURNING *`,
        [reason, eventId],
      );
      const row = updated.rows[0] as EventRow;
      await writeHistory(client, row, admin, 'CHANGES_REQUESTED', reason);
      return savedEvent(row, 'Correções solicitadas ao organizador.');
    });
  }

  async delete(actor: EventActor, idsInput: unknown): Promise<{ success: true; deletedIds: string[] }> {
    const ids = normalizeIds(idsInput);
    return transaction(this.pool, async client => {
      const admin = await requireAdmin(client, actor);
      const selected = await client.query(
        `SELECT id, nome, "userId", status FROM events WHERE id = ANY($1::text[]) FOR UPDATE`,
        [ids],
      );
      if (selected.rowCount !== ids.length) throw new MobileAuthError(404, 'Um ou mais eventos não foram encontrados.');
      for (const row of selected.rows as Array<EventRow>) {
        await writeHistory(client, row, admin, 'DELETED');
      }
      await client.query(`DELETE FROM events WHERE id = ANY($1::text[])`, [ids]);
      return { success: true, deletedIds: ids };
    });
  }
}

function normalizeIds(input: unknown): string[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100) {
    return badRequest('Selecione de 1 a 100 eventos.');
  }
  if (input.some(id => typeof id !== 'string' || !id.trim() || id.length > 200)) {
    return badRequest('Confira os eventos selecionados.');
  }
  const ids = [...new Set(input as string[])];
  if (ids.length !== input.length) return badRequest('A lista contém eventos repetidos.');
  return ids;
}
