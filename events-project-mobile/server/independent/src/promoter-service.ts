import type { Pool } from 'pg';
import type { Role } from './auth-service';
import { MobileAuthError } from './auth-service';
import type { EventReader } from './event-repository';

export class PostgresPromoterService {
  constructor(private readonly pool: Pool, private readonly events: EventReader) {}

  async profile(promoterId: string, userId: string | null): Promise<Record<string, unknown>> {
    const result = await this.pool.query(
      `SELECT u.id, u.name, u.image, u.bio, u."contactUrl",
              (SELECT COUNT(*)::int FROM "Follow" f WHERE f."promoterId" = u.id) AS "followerCount",
              EXISTS(SELECT 1 FROM "Follow" f WHERE f."promoterId" = u.id AND f."userId" = $2) AS "isFollowing"
       FROM "User" u
       WHERE u.id = $1 AND u.role = ANY($3::"Role"[])
       LIMIT 1`,
      [promoterId, userId, ['PROMOTER', 'ADMIN']],
    );
    if (!result.rowCount) throw new MobileAuthError(404, 'Promotor indisponível.');
    return { ...result.rows[0], events: await this.events.getPromoterEvents(promoterId) };
  }

  async toggleFollow(promoterId: string, userId: string): Promise<Record<string, unknown>> {
    if (promoterId === userId) throw new MobileAuthError(400, 'Você não pode seguir seu próprio perfil.');
    return this.pool.connect().then(async client => {
      try {
        await client.query('BEGIN');
        const promoter = await client.query(
          `SELECT id FROM "User" WHERE id = $1 AND role = ANY($2::"Role"[]) FOR UPDATE`,
          [promoterId, ['PROMOTER', 'ADMIN']],
        );
        if (!promoter.rowCount) throw new MobileAuthError(404, 'Promotor indisponível.');
        const current = await client.query(
          `SELECT 1 FROM "Follow" WHERE "userId" = $1 AND "promoterId" = $2`,
          [userId, promoterId],
        );
        const following = !current.rowCount;
        if (following) {
          await client.query(`INSERT INTO "Follow" ("userId", "promoterId") VALUES ($1, $2)`, [userId, promoterId]);
        } else {
          await client.query(`DELETE FROM "Follow" WHERE "userId" = $1 AND "promoterId" = $2`, [userId, promoterId]);
        }
        await client.query('COMMIT');
        return { success: true, message: following ? 'Você receberá avisos de novos eventos.' : 'Você deixou de seguir este promotor.', following };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });
  }

  async myProfile(userId: string): Promise<{ bio: string; contactUrl: string }> {
    const result = await this.pool.query(`SELECT bio, "contactUrl" FROM "User" WHERE id = $1`, [userId]);
    return result.rows[0] ?? { bio: '', contactUrl: '' };
  }

  async updateProfile(user: { id: string; role: Role }, input: unknown): Promise<Record<string, unknown>> {
    if (user.role !== 'ADMIN' && user.role !== 'PROMOTER') throw new MobileAuthError(403, 'Acesso negado.');
    if (
      !input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).length !== 2
      || !('bio' in input) || !('contactUrl' in input)
      || typeof input.bio !== 'string' || typeof input.contactUrl !== 'string'
    ) throw new MobileAuthError(400, 'Confira os campos informados.');
    const bio = input.bio.trim();
    const contactUrl = input.contactUrl.trim();
    if (bio.length > 1000 || contactUrl.length > 300) {
      throw new MobileAuthError(400, 'Use até 1000 caracteres na descrição e 300 no contato.');
    }
    if (contactUrl) {
      let url: URL;
      try {
        url = new URL(contactUrl);
      } catch {
        throw new MobileAuthError(400, 'Use um endereço http ou https.');
      }
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new MobileAuthError(400, 'Use um endereço http ou https.');
    }
    await this.pool.query(
      `UPDATE "User" SET bio = $1, "contactUrl" = $2 WHERE id = $3`,
      [bio, contactUrl, user.id],
    );
    return { success: true, message: 'Perfil público atualizado.' };
  }

  async stats(user: { id: string; role: Role }): Promise<Record<string, unknown>> {
    if (user.role !== 'ADMIN' && user.role !== 'PROMOTER') {
      return { events: [], totals: { views: 0, ticketClicks: 0, favorites: 0 } };
    }
    const result = await this.pool.query(
      `SELECT e.id, e.nome, e.status, e.views, e."ticketClicks",
              (SELECT COUNT(*)::int FROM "Favorite" f WHERE f."eventId" = e.id) AS favorites
       FROM events e WHERE e."userId" = $1 ORDER BY e."dataInicio" DESC`,
      [user.id],
    );
    const entries = result.rows as Array<Record<string, unknown> & {
      id: string;
      views: number;
      ticketClicks: number;
      favorites: number;
    }>;
    const daily = entries.length
      ? await this.pool.query(
        `SELECT "eventId", day, views, "ticketClicks" FROM (
           SELECT "eventId", day, views, "ticketClicks",
                  ROW_NUMBER() OVER (PARTITION BY "eventId" ORDER BY day DESC) AS position
           FROM "EventMetric" WHERE "eventId" = ANY($1::text[])
         ) metrics WHERE position <= 30 ORDER BY "eventId", day DESC`,
        [entries.map(event => event.id)],
      )
      : { rows: [] };
    const metricsByEvent = new Map<string, unknown[]>();
    for (const metric of daily.rows as Array<{ eventId: string }>) {
      const list = metricsByEvent.get(metric.eventId) ?? [];
      list.push(metric);
      metricsByEvent.set(metric.eventId, list);
    }
    const events = entries.map(event => ({
      ...event,
      daily: metricsByEvent.get(event.id) ?? [],
    }));
    const totals = events.reduce((sum, event) => ({
      views: sum.views + Number(event.views),
      ticketClicks: sum.ticketClicks + Number(event.ticketClicks),
      favorites: sum.favorites + Number(event.favorites),
    }), { views: 0, ticketClicks: 0, favorites: 0 });
    return { events, totals };
  }
}
