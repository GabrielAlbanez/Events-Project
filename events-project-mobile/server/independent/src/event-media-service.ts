import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { MobileAuthError } from './auth-service';
import type { Role } from './auth-service';

const maximumAssetBytes = 5 * 1024 * 1024;
const legacyProfileFilename = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{13}-uploaded_image)\.(?:jpg|png|webp|avif)$/i;

export interface EventMediaActor {
  id: string;
  role: Role;
}

export interface UploadedEventImage {
  bytes: Buffer;
  mimeType: string;
  fileName?: string;
}

export interface EventMediaResult {
  id: string;
  url: string;
  mimeType: string;
  size: number;
}

export interface EventMediaResponse {
  status: 200;
  contentType: string;
  contentLength: number;
  cacheControl: string;
  body: Buffer;
}

interface UserRoleRow {
  id: string;
  role: Role;
}

interface MediaRow {
  id: string;
  ownerId: string | null;
  mimeType: string;
  size: number;
  content: Buffer;
  isPublic: boolean;
}

function invalid(message: string): never {
  throw new MobileAuthError(400, message);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function mimeFromMagic(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'image/png';
  if (
    bytes.length >= 12
    && bytes.toString('ascii', 0, 4) === 'RIFF'
    && bytes.toString('ascii', 8, 12) === 'WEBP'
  ) return 'image/webp';
  if (
    bytes.length >= 12
    && bytes.toString('ascii', 4, 8) === 'ftyp'
    && ['avif', 'avis', 'mif1', 'msf1'].includes(bytes.toString('ascii', 8, 12))
  ) return 'image/avif';
  return null;
}

async function verifyActor(pool: Pool, actor: EventMediaActor): Promise<UserRoleRow> {
  if (!actor || typeof actor.id !== 'string' || !actor.id) {
    throw new MobileAuthError(401, 'Entre na sua conta para continuar.');
  }
  const result = await pool.query(`SELECT id, role FROM "User" WHERE id = $1`, [actor.id]);
  const user = result.rows[0] as UserRoleRow | undefined;
  if (!user || user.role !== actor.role) throw new MobileAuthError(403, 'Acesso negado.');
  return user;
}

export class PostgresEventMediaService {
  constructor(
    private readonly pool: Pool,
    private readonly publicApiUrl?: string,
    private readonly publicWebOrigin?: string,
  ) {}

  async save(actor: EventMediaActor, upload: UploadedEventImage): Promise<EventMediaResult> {
    const user = await verifyActor(this.pool, actor);
    if (!upload || !Buffer.isBuffer(upload.bytes)) return invalid('Envie um arquivo de imagem válido.');
    if (upload.bytes.length === 0 || upload.bytes.length > maximumAssetBytes) {
      throw new MobileAuthError(413, 'Cada imagem deve ter entre 1 byte e 5 MB.');
    }
    const detected = mimeFromMagic(upload.bytes);
    if (!detected || upload.mimeType !== detected) return invalid('O conteúdo do arquivo não corresponde a uma imagem aceita.');
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO "MobileEventMedia" (id, "ownerId", "mimeType", size, content)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, user.id, detected, upload.bytes.length, upload.bytes],
    );
    return {
      id,
      url: `/v1/media/events/${id}`,
      mimeType: detected,
      size: upload.bytes.length,
    };
  }

  async saveProfileImage(actor: EventMediaActor, upload: UploadedEventImage): Promise<EventMediaResult> {
    const user = await verifyActor(this.pool, actor);
    if (!this.publicApiUrl) {
      throw new MobileAuthError(503, 'O endereço público da API ainda não foi configurado para fotos de perfil.');
    }
    if (!upload || !Buffer.isBuffer(upload.bytes)) return invalid('Envie um arquivo de imagem válido.');
    if (upload.bytes.length === 0 || upload.bytes.length > maximumAssetBytes) {
      throw new MobileAuthError(413, 'A imagem deve ter entre 1 byte e 5 MB.');
    }
    const detected = mimeFromMagic(upload.bytes);
    if (!detected || upload.mimeType !== detected) return invalid('O conteúdo do arquivo não corresponde a uma imagem aceita.');

    const id = randomUUID();
    const url = `${this.publicApiUrl}/v1/media/profile/${id}`;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO "MobileEventMedia" (id, "ownerId", "mimeType", size, content)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, user.id, detected, upload.bytes.length, upload.bytes],
      );
      const updated = await client.query(
        `UPDATE "User" SET image = $2 WHERE id = $1`,
        [user.id, url],
      );
      if (!updated.rowCount) throw new MobileAuthError(404, 'Usuário indisponível.');
      await client.query(
        `SELECT pg_notify('eventmap_profile_image_updated', $1)`,
        [user.id],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return { id, url, mimeType: detected, size: upload.bytes.length };
  }

  async readProfileImage(assetId: string): Promise<EventMediaResponse> {
    if (!isUuid(assetId)) throw new MobileAuthError(404, 'Imagem não encontrada.');
    const path = `/v1/media/profile/${assetId}`;
    const result = await this.pool.query(
      `SELECT m."mimeType", m.size, m.content
       FROM "MobileEventMedia" m
       WHERE m.id = $1
         AND EXISTS (
           SELECT 1 FROM "User" u
           WHERE RIGHT(u.image, LENGTH($2)) = $2
         )
       LIMIT 1`,
      [assetId, path],
    );
    const media = result.rows[0] as Omit<MediaRow, 'id' | 'ownerId' | 'isPublic'> | undefined;
    if (!media) throw new MobileAuthError(404, 'Imagem não encontrada.');
    const body = Buffer.isBuffer(media.content) ? media.content : Buffer.from(media.content as unknown as Uint8Array);
    return {
      status: 200,
      contentType: media.mimeType,
      contentLength: body.length,
      cacheControl: 'public, max-age=31536000, immutable',
      body,
    };
  }

  async readLegacyProfileImage(filename: string): Promise<EventMediaResponse> {
    if (!legacyProfileFilename.test(filename)) throw new MobileAuthError(404, 'Imagem não encontrada.');
    if (!this.publicWebOrigin) throw new MobileAuthError(503, 'A origem pública de mídia da Web não foi configurada.');

    const target = new URL(`/api/media/${encodeURIComponent(filename)}`, this.publicWebOrigin);
    let upstream: Response;
    try {
      upstream = await fetch(target, {
        method: 'GET',
        headers: { Accept: 'image/jpeg, image/png, image/webp, image/avif' },
        redirect: 'error',
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw new MobileAuthError(502, 'Não foi possível acessar a imagem de perfil armazenada pela Web.');
    }
    if (upstream.status === 404) throw new MobileAuthError(404, 'Imagem não encontrada.');
    if (!upstream.ok || !upstream.body) {
      throw new MobileAuthError(502, 'A Web não conseguiu fornecer a imagem de perfil.');
    }

    const declaredType = upstream.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
    const declaredLength = Number(upstream.headers.get('content-length') || 0);
    if (declaredLength > maximumAssetBytes) {
      await upstream.body.cancel();
      throw new MobileAuthError(502, 'A imagem de perfil armazenada pela Web excede o limite permitido.');
    }
    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const item = await reader.read();
        if (item.done) break;
        size += item.value.byteLength;
        if (size > maximumAssetBytes) {
          await reader.cancel();
          throw new MobileAuthError(502, 'A imagem de perfil armazenada pela Web excede o limite permitido.');
        }
        chunks.push(item.value);
      }
    } catch (error) {
      if (error instanceof MobileAuthError) throw error;
      throw new MobileAuthError(502, 'A transferência da imagem de perfil pela Web foi interrompida.');
    } finally {
      reader.releaseLock();
    }
    const body = Buffer.concat(chunks, size);
    const detected = mimeFromMagic(body);
    if (!detected || detected !== declaredType) {
      throw new MobileAuthError(502, 'A Web retornou um arquivo que não é uma imagem válida.');
    }
    return {
      status: 200,
      contentType: detected,
      contentLength: body.length,
      cacheControl: 'public, max-age=31536000, immutable',
      body,
    };
  }

  async read(assetId: string, actor: EventMediaActor | null = null): Promise<EventMediaResponse> {
    if (!isUuid(assetId)) throw new MobileAuthError(404, 'Imagem não encontrada.');
    const result = await this.pool.query(
      `SELECT m.id, m."ownerId", m."mimeType", m.size, m.content,
              (
                EXISTS (
                SELECT 1 FROM events e
                WHERE e.status = ANY($2::"EventStatus"[])
                  AND (e.banner = $3 OR $3 = ANY(e.carrossel))
                )
                OR EXISTS (SELECT 1 FROM "User" u WHERE u.image = $3)
                OR EXISTS (
                  SELECT 1 FROM "PartyProfile" p
                  JOIN events e ON e.id = p."eventId"
                  WHERE e.status = 'PUBLISHED' AND p.active = TRUE AND p."photoUrl" = $3
                )
              ) AS "isPublic"
       FROM "MobileEventMedia" m WHERE m.id = $1 LIMIT 1`,
      [assetId, ['PUBLISHED', 'CANCELLED', 'ENDED'], `/v1/media/events/${assetId}`],
    );
    const media = result.rows[0] as MediaRow | undefined;
    if (!media) throw new MobileAuthError(404, 'Imagem não encontrada.');
    if (!media.isPublic) {
      if (!actor) throw new MobileAuthError(404, 'Imagem não encontrada.');
      const user = await verifyActor(this.pool, actor);
      if (user.role !== 'ADMIN' && media.ownerId !== user.id) {
        throw new MobileAuthError(404, 'Imagem não encontrada.');
      }
    }
    const body = Buffer.isBuffer(media.content) ? media.content : Buffer.from(media.content as unknown as Uint8Array);
    return {
      status: 200,
      contentType: media.mimeType,
      contentLength: body.length,
      cacheControl: media.isPublic ? 'public, max-age=86400, immutable' : 'private, no-store',
      body,
    };
  }
}
