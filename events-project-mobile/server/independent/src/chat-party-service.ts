import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { MobileAuthError, type MobileUser } from './auth-service';

type Db = Pick<Pool, 'query'>;
type PartyIntent = 'FRIENDSHIP' | 'COMPANY' | 'DATING';
type JsonObject = Record<string, unknown>;
export interface EventChatSendInput { text: string; clientId: string }
export interface PrivateChatSendInput { text: string; clientId: string; imageId?: string }
export type PrivateChatControlInput =
  | { action: 'typing'; active: boolean }
  | { action: 'receipt'; messageId: number; read: boolean };
export interface PrivateChatImageUploadResult { id: string; url: string }
export interface PrivateChatImageBinary { contentType: string; bytes: Buffer }

function error(status: number, message: string): never {
  throw new MobileAuthError(status, message);
}

function validObject(input: unknown): input is JsonObject {
  return input !== null && typeof input === 'object' && !Array.isArray(input);
}

function valueText(input: unknown, field: string, max: number, min = 1): string {
  if (typeof input !== 'string' || input.trim().length < min || input.trim().length > max) {
    error(400, `Confira o campo ${field}.`);
  }
  return input.trim();
}

function safeId(input: string): string {
  if (!input || input.length > 160 || /[\/\\\u0000]/.test(input)) error(404, 'Conversa indisponível.');
  return input;
}

function iso(input: Date | string): string {
  return input instanceof Date ? input.toISOString() : new Date(input).toISOString();
}

function partyIntent(input: unknown): PartyIntent {
  if (input === 'FRIENDSHIP' || input === 'COMPANY' || input === 'DATING') return input;
  return error(400, 'Intenção inválida.');
}

function supportedImageType(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === 'image/png') {
    return bytes.length >= 8
      && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  if (contentType === 'image/webp') {
    return bytes.length >= 12
      && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF'
      && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP';
  }
  return contentType === 'image/avif' && bytes.length >= 16
    && String.fromCharCode(...bytes.subarray(4, 8)) === 'ftyp'
    && ['avif', 'avis'].includes(String.fromCharCode(...bytes.subarray(8, 12)));
}

function supportedLegacyImageType(bytes: Uint8Array, extension: string): string | null {
  if (extension === '.jpg' && supportedImageType(bytes, 'image/jpeg')) return 'image/jpeg';
  if (extension === '.png' && supportedImageType(bytes, 'image/png')) return 'image/png';
  if (extension === '.webp' && supportedImageType(bytes, 'image/webp')) return 'image/webp';
  if (extension === '.avif' && bytes.length >= 16
    && String.fromCharCode(...bytes.subarray(4, 8)) === 'ftyp'
    && ['avif', 'avis'].includes(String.fromCharCode(...bytes.subarray(8, 12)))) return 'image/avif';
  return null;
}

async function ensureEventAccess(db: Db, eventId: string, user: MobileUser): Promise<{ id: string; name: string }> {
  const result = await db.query<{ id: string; name: string; status: string; ownerId: string | null }>(
    `SELECT id, nome AS name, status, "userId" AS "ownerId" FROM events WHERE id = $1`,
    [eventId],
  );
  const event = result.rows[0];
  if (!event || event.status !== 'PUBLISHED') error(404, 'Evento indisponível.');
  const access = await db.query(
    `SELECT 1
       WHERE $2::text = 'ADMIN'
          OR EXISTS (SELECT 1 FROM "EventRegistration" r WHERE r."eventId" = $1 AND r."userId" = $3 AND r.status = ANY($4::"RegistrationStatus"[]))
          OR EXISTS (SELECT 1 FROM "CommunityTeamMember" t WHERE t."eventId" = $1 AND t."userId" = $3)`,
    [eventId, user.role, user.id, ['CONFIRMED', 'CHECKED_IN']],
  );
  if (event.ownerId !== user.id && !access.rowCount) error(403, 'Confirme sua presença no evento para acessar a conversa.');
  return { id: event.id, name: event.name };
}

async function ensurePartyEligibility(db: Db, eventId: string, userId: string): Promise<{ id: string; name: string }> {
  const result = await db.query<{ id: string; name: string }>(
    `SELECT e.id, e.nome AS name
       FROM events e JOIN "EventRegistration" r ON r."eventId" = e.id
      WHERE e.id = $1 AND e.status = 'PUBLISHED' AND r."userId" = $2
        AND r.status = ANY($3::"RegistrationStatus"[]) LIMIT 1`,
    [eventId, userId, ['CONFIRMED', 'CHECKED_IN']],
  );
  if (!result.rows[0]) error(403, 'Confirme sua presença no evento para participar das conexões.');
  return result.rows[0];
}

function messageDto(row: {
  id: number; clientId: string; text: string; createdAt: Date | string;
  authorId: string; name: string | null; image: string | null; viewerId: string; mediaId?: string | null;
  eventId: string; matchId?: string;
}) {
  return {
    id: Number(row.id),
    clientId: row.clientId,
    text: row.text,
    createdAt: iso(row.createdAt),
    author: { id: row.authorId, name: row.name ?? 'Participante', image: row.image },
    own: row.authorId === row.viewerId,
    ...(row.mediaId ? {
      image: {
        url: `/api/party-connections/${encodeURIComponent(row.eventId)}/matches/${encodeURIComponent(row.matchId ?? '')}/images/${encodeURIComponent(row.mediaId)}`,
      },
    } : {}),
  };
}

export class PostgresChatPartyService {
  constructor(private readonly pool: Pool) {}

  async chatHistory(eventId: string, user: MobileUser, before?: number) {
    safeId(eventId);
    const event = await ensureEventAccess(this.pool, eventId, user);
    const cursor = Number.isSafeInteger(before) && Number(before) > 0 ? Number(before) : null;
    const result = await this.pool.query(
      `SELECT m.id, m."clientId", m.text, m."createdAt", m."authorId",
              u.name, u.image, $2::text AS "viewerId", $3::text AS "eventId"
         FROM "EventChatMessage" m JOIN "User" u ON u.id = m."authorId"
        WHERE m."eventId" = $1 AND ($4::int IS NULL OR m.id < $4)
        ORDER BY m.id DESC LIMIT 51`,
      [eventId, user.id, eventId, cursor],
    );
    const hasMore = result.rows.length > 50;
    const rows = result.rows.slice(0, 50).reverse();
    return {
      event, messages: rows.map(messageDto),
      nextBefore: hasMore && rows.length ? Number(rows[0].id) : null,
      hasMore,
    };
  }

  async chatSend(eventId: string, user: MobileUser, input: EventChatSendInput) {
    safeId(eventId);
    if (!validObject(input)) error(400, 'Mensagem inválida.');
    if (Object.keys(input).length !== 2 || !('text' in input) || !('clientId' in input)) {
      error(400, 'Mensagem inválida.');
    }
    await ensureEventAccess(this.pool, eventId, user);
    const text = valueText(input.text, 'mensagem', 4000);
    const clientId = valueText(input.clientId, 'identificador', 120);
    const result = await this.pool.query(
      `INSERT INTO "EventChatMessage" ("eventId", "authorId", "clientId", text)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("eventId", "authorId", "clientId") DO NOTHING
       RETURNING id, "clientId", text, "createdAt", "authorId"`,
      [eventId, user.id, clientId, text],
    );
    const row = result.rows[0] ?? (await this.pool.query(
      `SELECT id, "clientId", text, "createdAt", "authorId"
         FROM "EventChatMessage" WHERE "eventId" = $1 AND "authorId" = $2 AND "clientId" = $3`,
      [eventId, user.id, clientId],
    )).rows[0];
    if (!row || row.text !== text) error(409, 'Este identificador já foi usado para outra mensagem.');
    const author = await this.pool.query(`SELECT name, image FROM "User" WHERE id = $1`, [user.id]);
    return {
      message: messageDto({
        ...row, ...author.rows[0], viewerId: user.id, eventId,
      }),
      duplicate: result.rowCount === 0,
    };
  }

  async partySnapshot(eventId: string, user: MobileUser, after?: string | null) {
    safeId(eventId);
    const event = await ensurePartyEligibility(this.pool, eventId, user.id);
    const mineResult = await this.pool.query(
      `SELECT "displayName", "photoUrl", bio, interests, intent, "adultDeclared", active
         FROM "PartyProfile" WHERE "eventId" = $1 AND "userId" = $2`,
      [eventId, user.id],
    );
    const mine = mineResult.rows[0] ?? null;
    const profiles = mine?.active ? await this.pool.query<{
      userId: string; displayName: string; photoUrl: string; bio: string; interests: string[];
      intent: PartyIntent; liked: boolean;
    }>(
      `SELECT p."userId", p."displayName", p."photoUrl", p.bio, p.interests, p.intent,
              EXISTS (SELECT 1 FROM "PartyLike" l WHERE l."eventId" = p."eventId" AND l."fromId" = $2 AND l."toId" = p."userId") AS liked
         FROM "PartyProfile" p
        WHERE p."eventId" = $1 AND p."userId" <> $2 AND p.active = TRUE
          AND ($3::text IS NULL OR p."userId" > $3)
          AND NOT EXISTS (SELECT 1 FROM "PartyBlock" b WHERE (b."fromId" = $2 AND b."toId" = p."userId") OR (b."fromId" = p."userId" AND b."toId" = $2))
        ORDER BY p."userId" LIMIT 31`,
      [eventId, user.id, after || null],
    ) : { rows: [] };
    const profileRows = profiles.rows.slice(0, 30);
    const matchRows = await this.pool.query<{
      id: string; createdAt: Date | string; partnerId: string; displayName: string;
      photoUrl: string; bio: string; interests: string[]; intent: PartyIntent; liked: boolean;
      unreadCount: number; lastText: string | null; lastCreatedAt: Date | string | null; lastAuthorId: string | null;
    }>(
      `SELECT m.id, m."createdAt", partner.id AS "partnerId",
              partner."displayName", partner."photoUrl", partner.bio, partner.interests, partner.intent,
              EXISTS (SELECT 1 FROM "PartyLike" l WHERE l."eventId" = m."eventId" AND l."fromId" = $2 AND l."toId" = partner."userId") AS liked,
              (SELECT COUNT(*)::int FROM "PartyMessage" unread
                WHERE unread."matchId" = m.id AND unread."authorId" <> $2
                  AND unread.id > COALESCE((SELECT r."readThrough" FROM "PartyMessageReceipt" r WHERE r."matchId" = m.id AND r."userId" = $2), 0)) AS "unreadCount",
              last.text AS "lastText", last."createdAt" AS "lastCreatedAt", last."authorId" AS "lastAuthorId"
         FROM "PartyMatch" m
         JOIN "PartyProfile" partner ON partner."eventId" = m."eventId"
           AND partner."userId" = CASE WHEN m."userAId" = $2 THEN m."userBId" ELSE m."userAId" END
         LEFT JOIN LATERAL (
           SELECT text, "createdAt", "authorId" FROM "PartyMessage"
            WHERE "matchId" = m.id ORDER BY id DESC LIMIT 1
         ) last ON TRUE
        WHERE m."eventId" = $1 AND m.active = TRUE AND $2 = ANY(ARRAY[m."userAId", m."userBId"])
          AND NOT EXISTS (SELECT 1 FROM "PartyBlock" b WHERE (b."fromId" = $2 AND b."toId" = partner."userId") OR (b."fromId" = partner."userId" AND b."toId" = $2))
        ORDER BY last."createdAt" DESC NULLS LAST, m."createdAt" DESC LIMIT 100`,
      [eventId, user.id],
    );
    const blocks = await this.pool.query<{ userId: string; displayName: string }>(
      `SELECT b."toId" AS "userId", COALESCE(p."displayName", u.name, u.email, 'Participante') AS "displayName"
         FROM "PartyBlock" b JOIN "User" u ON u.id = b."toId"
         LEFT JOIN "PartyProfile" p ON p."eventId" = $1 AND p."userId" = b."toId"
        WHERE b."fromId" = $2 ORDER BY "displayName"`,
      [eventId, user.id],
    );
    return {
      event,
      eligible: true,
      mine: mine ? {
        displayName: mine.displayName, photoUrl: mine.photoUrl, bio: mine.bio,
        interests: mine.interests, intent: mine.intent, adultDeclared: mine.adultDeclared, active: mine.active,
      } : null,
      profiles: profileRows.map(profile => ({
        userId: profile.userId, displayName: profile.displayName, photoUrl: profile.photoUrl,
        bio: profile.bio, interests: profile.interests, intent: profile.intent, liked: profile.liked,
      })),
      nextAfter: profiles.rows.length > 30 ? String(profileRows.at(-1)?.userId ?? '') || null : null,
      matches: matchRows.rows.map(match => ({
        id: match.id,
        profile: {
          userId: match.partnerId, displayName: match.displayName, photoUrl: match.photoUrl,
          bio: match.bio, interests: match.interests, intent: match.intent, liked: match.liked,
        },
        unreadCount: match.unreadCount,
        createdAt: iso(match.createdAt),
        ...(match.lastText !== null && match.lastCreatedAt ? {
          lastMessage: {
            text: match.lastText, createdAt: iso(match.lastCreatedAt), own: match.lastAuthorId === user.id,
          },
        } : {}),
      })),
      blocks: blocks.rows,
    };
  }

  async partyAction(eventId: string, user: MobileUser, input: unknown): Promise<{ ok: true }> {
    safeId(eventId);
    if (!validObject(input) || typeof input.action !== 'string') error(400, 'Ação inválida.');
    await ensurePartyEligibility(this.pool, eventId, user.id);
    const action = input.action;
    if (action === 'profile.save') {
      const displayName = valueText(input.displayName, 'nome', 60, 2);
      const bio = typeof input.bio === 'string' ? input.bio.trim().slice(0, 300) : '';
      const photoUrl = typeof input.photoUrl === 'string' ? input.photoUrl.trim().slice(0, 1000) : '';
      if (photoUrl && !photoUrl.startsWith('/')) error(400, 'A foto do perfil precisa ser enviada pelo serviço de mídia.');
      const interests = Array.isArray(input.interests) ? input.interests : [];
      if (interests.length > 6 || interests.some(item => typeof item !== 'string' || !item.trim() || item.trim().length > 30)) {
        error(400, 'Informe até 6 interesses com no máximo 30 caracteres.');
      }
      const intent = partyIntent(input.intent);
      const adultDeclared = input.adultDeclared === true;
      if (intent === 'DATING' && !adultDeclared) error(400, 'A intenção de paquera exige declaração de maioridade.');
      await this.pool.query(
        `INSERT INTO "PartyProfile" ("eventId", "userId", active, "displayName", "photoUrl", bio, interests, intent, "adultDeclared")
         VALUES ($1, $2, TRUE, $3, $4, $5, $6::text[], $7, $8)
         ON CONFLICT ("eventId", "userId") DO UPDATE SET
           active = TRUE, "displayName" = EXCLUDED."displayName", "photoUrl" = EXCLUDED."photoUrl",
           bio = EXCLUDED.bio, interests = EXCLUDED.interests, intent = EXCLUDED.intent,
           "adultDeclared" = EXCLUDED."adultDeclared", "updatedAt" = NOW()`,
        [eventId, user.id, displayName, photoUrl, bio, interests.map((item: string) => item.trim()), intent, adultDeclared],
      );
    } else if (action === 'profile.leave') {
      await this.pool.query(`UPDATE "PartyProfile" SET active = FALSE, "updatedAt" = NOW() WHERE "eventId" = $1 AND "userId" = $2`, [eventId, user.id]);
      await this.pool.query(
        `UPDATE "PartyMatch" SET active = FALSE WHERE "eventId" = $1 AND $2 = ANY(ARRAY["userAId", "userBId"])`,
        [eventId, user.id],
      );
    } else if (action === 'like') {
      const targetId = safeId(valueText(input.userId, 'perfil', 160));
      if (targetId === user.id) error(400, 'Não é possível curtir seu próprio perfil.');
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const own = await client.query(
          `SELECT 1 FROM "PartyProfile" WHERE "eventId" = $1 AND "userId" = $2 AND active = TRUE FOR UPDATE`,
          [eventId, user.id],
        );
        if (!own.rowCount) error(403, 'Ative seu perfil antes de curtir outras pessoas.');
        const target = await client.query(
          `SELECT 1 FROM "PartyProfile" p
            WHERE p."eventId" = $1 AND p."userId" = $2 AND p.active = TRUE
              AND NOT EXISTS (SELECT 1 FROM "PartyBlock" b WHERE (b."fromId" = $3 AND b."toId" = $2) OR (b."fromId" = $2 AND b."toId" = $3))
            FOR UPDATE OF p`,
          [eventId, targetId, user.id],
        );
        if (!target.rowCount) error(404, 'Perfil indisponível.');
        await client.query(
          `INSERT INTO "PartyLike" ("eventId", "fromId", "toId") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [eventId, user.id, targetId],
        );
        const reciprocal = await client.query(
          `SELECT 1 FROM "PartyLike" WHERE "eventId" = $1 AND "fromId" = $2 AND "toId" = $3`,
          [eventId, targetId, user.id],
        );
        if (reciprocal.rowCount) {
          const [userAId, userBId] = [user.id, targetId].sort();
          await client.query(
            `INSERT INTO "PartyMatch" (id, "eventId", "userAId", "userBId", active)
             VALUES ($1, $2, $3, $4, TRUE)
             ON CONFLICT ("eventId", "userAId", "userBId") DO UPDATE SET active = TRUE`,
            [randomUUID(), eventId, userAId, userBId],
          );
        }
        await client.query('COMMIT');
      } catch (cause) {
        await client.query('ROLLBACK');
        throw cause;
      } finally {
        client.release();
      }
    } else if (action === 'block' || action === 'unblock') {
      const targetId = safeId(valueText(input.userId, 'perfil', 160));
      if (targetId === user.id) error(400, 'Não é possível bloquear sua própria conta.');
      if (action === 'block') {
        await this.pool.query(`INSERT INTO "PartyBlock" ("fromId", "toId") VALUES ($1, $2) ON CONFLICT DO NOTHING`, [user.id, targetId]);
        await this.pool.query(
          `UPDATE "PartyMatch" SET active = FALSE
            WHERE "eventId" = $1 AND $2 = ANY(ARRAY["userAId", "userBId"])
              AND $3 = ANY(ARRAY["userAId", "userBId"])`,
          [eventId, user.id, targetId],
        );
      } else {
        await this.pool.query(`DELETE FROM "PartyBlock" WHERE "fromId" = $1 AND "toId" = $2`, [user.id, targetId]);
      }
    } else if (action === 'report') {
      const targetId = safeId(valueText(input.userId, 'perfil', 160));
      if (targetId === user.id) error(400, 'Não é possível denunciar sua própria conta.');
      const reason = valueText(input.reason, 'motivo', 30);
      if (!['HARASSMENT', 'SPAM', 'SAFETY', 'OTHER'].includes(reason)) error(400, 'Motivo de denúncia inválido.');
      let evidence: string | null = null;
      if (Number.isSafeInteger(input.messageId) && Number(input.messageId) > 0) {
        const message = await this.pool.query<{ authorId: string; text: string; matchId: string }>(
          `SELECT m."authorId", m.text, m."matchId"
             FROM "PartyMessage" m
             JOIN "PartyMatch" x ON x.id = m."matchId"
            WHERE m.id = $1 AND x."eventId" = $2 AND $3 = ANY(ARRAY[x."userAId", x."userBId"])
            LIMIT 1`,
          [input.messageId, eventId, user.id],
        );
        if (!message.rows[0] || message.rows[0].authorId !== targetId) error(404, 'Mensagem indisponível para denúncia.');
        evidence = message.rows[0].text.slice(0, 2000) || '[Mensagem com imagem]';
      }
      const target = await this.pool.query(
        `SELECT 1 FROM "PartyProfile" WHERE "eventId" = $1 AND "userId" = $2 LIMIT 1`,
        [eventId, targetId],
      );
      if (!target.rowCount) error(404, 'Perfil indisponível.');
      await this.pool.query(
        `INSERT INTO "PartyReport" (id, "eventId", "reporterId", "targetId", reason, evidence)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), eventId, user.id, targetId, reason, evidence],
      );
    } else {
      error(400, 'Ação de conexões desconhecida.');
    }
    return { ok: true };
  }

  async privateHistory(eventId: string, matchId: string, user: MobileUser, before?: number) {
    const match = await this.authorizedMatch(eventId, matchId, user.id);
    const cursor = Number.isSafeInteger(before) && Number(before) > 0 ? Number(before) : null;
    const result = await this.pool.query(
      `SELECT m.id, m."clientId", m.text, m."createdAt", m."authorId",
              u.name, u.image, $2::text AS "viewerId", $3::text AS "eventId", $4::text AS "matchId",
              media."mediaId"
         FROM "PartyMessage" m JOIN "User" u ON u.id = m."authorId"
         LEFT JOIN "PartyMessageMedia" media ON media."matchId" = m."matchId"
           AND media."authorId" = m."authorId" AND media."clientId" = m."clientId"
        WHERE m."matchId" = $1 AND ($5::int IS NULL OR m.id < $5)
        ORDER BY m.id DESC LIMIT 51`,
      [matchId, user.id, eventId, matchId, cursor],
    );
    const hasMore = result.rows.length > 50;
    const rows = result.rows.slice(0, 50).reverse();
    const partnerReceipt = await this.pool.query<{ deliveredThrough: number; readThrough: number; typingUntil: Date | string | null }>(
      `SELECT "deliveredThrough", "readThrough", "typingUntil"
         FROM "PartyMessageReceipt" WHERE "matchId" = $1 AND "userId" = $2`,
      [matchId, match.partnerId],
    );
    const receipt = partnerReceipt.rows[0];
    return {
      event: { id: match.eventId, name: match.partnerName, partnerId: match.partnerId, partnerImage: match.partnerImage },
      messages: rows.map(messageDto),
      nextBefore: hasMore && rows.length ? Number(rows[0].id) : null,
      hasMore,
      partnerReceipt: receipt ? {
        deliveredThrough: Number(receipt.deliveredThrough), readThrough: Number(receipt.readThrough),
        typingUntil: receipt.typingUntil ? new Date(receipt.typingUntil).getTime() : 0,
      } : { deliveredThrough: 0, readThrough: 0, typingUntil: 0 },
    };
  }

  async privateSend(eventId: string, matchId: string, user: MobileUser, input: PrivateChatSendInput) {
    if (!validObject(input)) error(400, 'Mensagem inválida.');
    if (
      Object.keys(input).some(key => !['text', 'clientId', 'imageId'].includes(key))
      || !('text' in input) || !('clientId' in input)
    ) error(400, 'Mensagem inválida.');
    await this.authorizedMatch(eventId, matchId, user.id);
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    const clientId = valueText(input.clientId, 'identificador', 120);
    const imageId = typeof input.imageId === 'string' && input.imageId ? safeId(input.imageId) : null;
    if (!text && !imageId || text.length > 4000) error(400, 'Informe uma mensagem ou imagem válida.');
    const client = await this.pool.connect();
    let row: { id: number; clientId: string; text: string; createdAt: Date | string; authorId: string } | undefined;
    let sentImageId: string | null = null;
    let inserted = false;
    try {
      await client.query('BEGIN');
      if (imageId) {
        const image = await client.query(
          `SELECT 1 FROM "PrivateChatMedia" WHERE id = $1 AND "matchId" = $2 AND "uploaderId" = $3 FOR UPDATE`,
          [imageId, matchId, user.id],
        );
        if (!image.rowCount) error(404, 'Imagem indisponível para esta conversa.');
      }
      const result = await client.query(
        `INSERT INTO "PartyMessage" ("matchId", "authorId", "clientId", text)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ("matchId", "authorId", "clientId") DO NOTHING
         RETURNING id, "clientId", text, "createdAt", "authorId"`,
        [matchId, user.id, clientId, text],
      );
      inserted = result.rowCount === 1;
      row = result.rows[0] ?? (await client.query(
        `SELECT id, "clientId", text, "createdAt", "authorId"
           FROM "PartyMessage" WHERE "matchId" = $1 AND "authorId" = $2 AND "clientId" = $3 FOR UPDATE`,
        [matchId, user.id, clientId],
      )).rows[0];
      if (!row || row.text !== text) error(409, 'Este identificador já foi usado para outra mensagem.');
      if (imageId) {
        await client.query(
          `INSERT INTO "PartyMessageMedia" ("matchId", "authorId", "clientId", "mediaId")
           VALUES ($1, $2, $3, $4) ON CONFLICT ("matchId", "authorId", "clientId") DO NOTHING`,
          [matchId, user.id, clientId, imageId],
        );
      }
      const attached = await client.query<{ mediaId: string }>(
        `SELECT "mediaId" FROM "PartyMessageMedia" WHERE "matchId" = $1 AND "authorId" = $2 AND "clientId" = $3`,
        [matchId, user.id, clientId],
      );
      sentImageId = attached.rows[0]?.mediaId ?? null;
      if (sentImageId !== imageId) error(409, 'Este identificador já foi usado para outra imagem.');
      await client.query('COMMIT');
    } catch (cause) {
      await client.query('ROLLBACK');
      throw cause;
    } finally {
      client.release();
    }
    if (!row) error(503, 'Não foi possível salvar a mensagem.');
    const author = await this.pool.query(`SELECT name, image FROM "User" WHERE id = $1`, [user.id]);
    return {
      message: messageDto({
        ...row, ...author.rows[0], viewerId: user.id, eventId, matchId, mediaId: sentImageId,
      }),
      duplicate: !inserted,
    };
  }

  async privateControl(
    eventId: string,
    matchId: string,
    user: MobileUser,
    input: PrivateChatControlInput,
  ): Promise<{ ok: true }> {
    await this.authorizedMatch(eventId, matchId, user.id);
    if (!validObject(input) || typeof input.action !== 'string') error(400, 'Ação inválida.');
    if (input.action === 'typing') {
      if (Object.keys(input).length !== 2 || !('active' in input)) error(400, 'Estado de digitação inválido.');
      if (typeof input.active !== 'boolean') error(400, 'Estado de digitação inválido.');
      await this.pool.query(
        `INSERT INTO "PartyMessageReceipt" ("matchId", "userId", "typingUntil")
         VALUES ($1, $2, CASE WHEN $3 THEN NOW() + INTERVAL '5 seconds' ELSE NULL END)
         ON CONFLICT ("matchId", "userId") DO UPDATE
           SET "typingUntil" = CASE WHEN EXCLUDED."typingUntil" IS NULL THEN NULL
                                    ELSE GREATEST(COALESCE("PartyMessageReceipt"."typingUntil", '-infinity'::timestamptz), EXCLUDED."typingUntil") END`,
        [matchId, user.id, input.active],
      );
    } else if (input.action === 'receipt') {
      if (Object.keys(input).length !== 3 || !('messageId' in input) || !('read' in input)) {
        error(400, 'Confirmação de entrega inválida.');
      }
      if (!Number.isSafeInteger(input.messageId) || Number(input.messageId) < 1 || typeof input.read !== 'boolean') {
        error(400, 'Confirmação de entrega inválida.');
      }
      const target = await this.pool.query<{ id: number; authorId: string }>(
        `SELECT id, "authorId" FROM "PartyMessage" WHERE id = $1 AND "matchId" = $2`,
        [input.messageId, matchId],
      );
      if (!target.rows[0] || target.rows[0].authorId === user.id) error(404, 'Mensagem indisponível.');
      await this.pool.query(
        `INSERT INTO "PartyMessageReceipt" ("matchId", "userId", "deliveredThrough", "readThrough")
         VALUES ($1, $2, $3, CASE WHEN $4 THEN $3 ELSE 0 END)
         ON CONFLICT ("matchId", "userId") DO UPDATE SET
           "deliveredThrough" = GREATEST("PartyMessageReceipt"."deliveredThrough", EXCLUDED."deliveredThrough"),
           "readThrough" = CASE WHEN $4
             THEN GREATEST("PartyMessageReceipt"."readThrough", EXCLUDED."readThrough")
             ELSE "PartyMessageReceipt"."readThrough" END`,
        [matchId, user.id, input.messageId, input.read],
      );
    } else {
      error(400, 'Ação de conversa desconhecida.');
    }
    return { ok: true };
  }

  async uploadPrivateImage(
    eventId: string,
    matchId: string,
    user: MobileUser,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<PrivateChatImageUploadResult> {
    await this.authorizedMatch(eventId, matchId, user.id);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > 5 * 1024 * 1024) {
      error(413, 'A imagem deve ter no máximo 5 MB.');
    }
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
    const normalizedType = contentType.toLowerCase();
    if (!allowedTypes.has(normalizedType) || !supportedImageType(bytes, normalizedType)) {
      error(415, 'Formato de imagem não aceito.');
    }
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO "PrivateChatMedia" (id, "eventId", "matchId", "uploaderId", "contentType", bytes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, eventId, matchId, user.id, normalizedType, Buffer.from(bytes)],
    );
    return {
      id,
      url: `/api/party-connections/${encodeURIComponent(eventId)}/matches/${encodeURIComponent(matchId)}/images/${encodeURIComponent(id)}`,
    };
  }

  async privateImage(
    eventId: string,
    matchId: string,
    imageId: string,
    user: MobileUser,
  ): Promise<PrivateChatImageBinary> {
    await this.authorizedMatch(eventId, matchId, user.id);
    const result = await this.pool.query<{ contentType: string; bytes: Buffer }>(
      `SELECT media."contentType", media.bytes
         FROM "PrivateChatMedia" media
         JOIN "PartyMessageMedia" attachment ON attachment."mediaId" = media.id
         JOIN "PartyMessage" message ON message."matchId" = attachment."matchId"
           AND message."authorId" = attachment."authorId" AND message."clientId" = attachment."clientId"
        WHERE media.id = $1 AND media."eventId" = $2 AND media."matchId" = $3 LIMIT 1`,
      [imageId, eventId, matchId],
    );
    if (!result.rows[0]) error(404, 'Imagem indisponível.');
    return { contentType: result.rows[0].contentType, bytes: result.rows[0].bytes };
  }

  async partyReports(user: MobileUser) {
    if (user.role !== 'ADMIN') error(403, 'Acesso restrito à administração.');
    const result = await this.pool.query(
      `SELECT id, "eventId", reason, evidence, status, "createdAt"
         FROM "PartyReport" ORDER BY "createdAt" DESC LIMIT 500`,
    );
    return { reports: result.rows.map(row => ({ ...row, createdAt: iso(row.createdAt) })) };
  }

  private async authorizedMatch(eventId: string, matchId: string, userId: string) {
    safeId(eventId);
    safeId(matchId);
    const result = await this.pool.query<{
      eventId: string; partnerId: string; partnerName: string; partnerImage: string | null;
    }>(
      `SELECT m."eventId", p."userId" AS "partnerId",
              p."displayName" AS "partnerName", p."photoUrl" AS "partnerImage"
         FROM "PartyMatch" m
         JOIN "PartyProfile" p ON p."eventId" = m."eventId"
           AND p."userId" = CASE WHEN m."userAId" = $3 THEN m."userBId" ELSE m."userAId" END
        WHERE m.id = $1 AND m."eventId" = $2 AND m.active = TRUE
          AND $3 = ANY(ARRAY[m."userAId", m."userBId"])
          AND p.active = TRUE
          AND EXISTS (SELECT 1 FROM events e WHERE e.id = m."eventId" AND e.status = 'PUBLISHED')
          AND EXISTS (SELECT 1 FROM "EventRegistration" r
                       WHERE r."eventId" = m."eventId" AND r."userId" = $3
                         AND r.status = ANY(ARRAY['CONFIRMED','CHECKED_IN']::"RegistrationStatus"[]))
          AND EXISTS (SELECT 1 FROM "EventRegistration" r
                       WHERE r."eventId" = m."eventId" AND r."userId" = p."userId"
                         AND r.status = ANY(ARRAY['CONFIRMED','CHECKED_IN']::"RegistrationStatus"[]))
          AND NOT EXISTS (SELECT 1 FROM "PartyBlock" b WHERE (b."fromId" = $3 AND b."toId" = p."userId") OR (b."fromId" = p."userId" AND b."toId" = $3))
        LIMIT 1`,
      [matchId, eventId, userId],
    );
    const match = result.rows[0];
    if (!match) error(404, 'Conversa indisponível.');
    return match;
  }

}
