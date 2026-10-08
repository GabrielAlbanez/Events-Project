import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { GoogleAccountConflictError } from './auth-service';
import type { GoogleProfile, MobileAuthRepository, MobileUser, Role } from './auth-service';

const userColumns = 'id, name, email, image, role, "emailVerified", "suspendedAt", "suspendedUntil", "sessionVersion"';
const qualifiedUserColumns = 'u.id, u.name, u.email, u.image, u.role, u."emailVerified", u."suspendedAt", u."suspendedUntil", u."sessionVersion"';

function userFromRow(row: Record<string, unknown>): MobileUser {
  const role = row.role;
  if (role !== 'BASIC' && role !== 'PROMOTER' && role !== 'ADMIN') {
    throw new Error('Unexpected role value in shared database.');
  }
  return {
    id: String(row.id),
    name: typeof row.name === 'string' ? row.name : null,
    email: typeof row.email === 'string' ? row.email : null,
    image: typeof row.image === 'string' ? row.image : null,
    role: role as Role,
    emailVerified: typeof row.emailVerified === 'boolean' ? row.emailVerified : null,
    suspendedAt: row.suspendedAt instanceof Date ? row.suspendedAt : null,
    suspendedUntil: row.suspendedUntil instanceof Date ? row.suspendedUntil : null,
    sessionVersion: Number(row.sessionVersion),
  };
}

export class PostgresAuthRepository implements MobileAuthRepository {
  constructor(private readonly pool: Pool) {}

  async findGoogleAccount(subject: string): Promise<MobileUser | null> {
    const result = await this.pool.query(
      `SELECT ${qualifiedUserColumns}
       FROM "Account" a
       JOIN "User" u ON u.id = a."userId"
       WHERE a.provider = 'google' AND a."providerAccountId" = $1
       LIMIT 1`,
      [subject],
    );
    return result.rows[0] ? userFromRow(result.rows[0] as Record<string, unknown>) : null;
  }

  async findUserByEmail(email: string): Promise<MobileUser | null> {
    const result = await this.pool.query(
      `SELECT ${userColumns} FROM "User" WHERE lower(email) = $1 LIMIT 1`,
      [email],
    );
    return result.rows[0] ? userFromRow(result.rows[0] as Record<string, unknown>) : null;
  }

  async createGoogleAccount(profile: GoogleProfile): Promise<MobileUser> {
    const client = await this.pool.connect();
    const userId = randomUUID();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO "User"
          (id, email, name, image, "emailVerified", role, "sessionVersion")
         VALUES ($1, $2, $3, $4, TRUE, 'BASIC', 0)
         RETURNING ${userColumns}`,
        [userId, profile.email, profile.name, profile.image],
      );
      await client.query(
        `INSERT INTO "Account" (id, "userId", type, provider, "providerAccountId")
         VALUES ($1, $2, 'oauth', 'google', $3)`,
        [randomUUID(), userId, profile.subject],
      );
      await client.query('COMMIT');
      return userFromRow(inserted.rows[0] as Record<string, unknown>);
    } catch (error) {
      await client.query('ROLLBACK');
      if (
        error
        && typeof error === 'object'
        && 'code' in error
        && error.code === '23505'
      ) {
        throw new GoogleAccountConflictError();
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async findUserById(id: string): Promise<MobileUser | null> {
    const result = await this.pool.query(
      `SELECT ${userColumns} FROM "User" WHERE id = $1 LIMIT 1`,
      [id],
    );
    return result.rows[0] ? userFromRow(result.rows[0] as Record<string, unknown>) : null;
  }
}
