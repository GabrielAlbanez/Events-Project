import { createHash, randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Pool } from 'pg';
import { MobileAuthError } from './auth-service';
import type { AccessToken, LoginResult, Role } from './auth-service';

const genericLinkMessage = 'Se a conta puder receber este link, enviaremos as instruções por e-mail. Confira também o spam.';
const verificationLifetimeMs = 24 * 60 * 60 * 1000;
const recoveryLifetimeMs = 30 * 60 * 1000;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

interface AccountRow {
  id: string;
  name: string | null;
  email: string | null;
  password: string | null;
  image: string | null;
  role: Role;
  emailVerified: boolean | null;
  suspendedAt: Date | null;
  suspendedUntil: Date | null;
  sessionVersion: number;
  bio?: string;
  contactUrl?: string;
}

type SendMail = (to: string, subject: string, text: string) => Promise<void>;

function publicUser(user: AccountRow, provider: 'credentials' | 'google'): LoginResult['user'] {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: user.role,
    emailVerified: user.emailVerified,
    provider,
  };
}

function active(user: AccountRow, now: Date): void {
  if (user.suspendedAt && (!user.suspendedUntil || user.suspendedUntil > now)) {
    throw new MobileAuthError(403, 'Esta conta está suspensa.');
  }
}

function loginResult(
  user: AccountRow,
  token: string,
  now: Date,
  provider: 'credentials' | 'google',
): LoginResult {
  return {
    token,
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    user: publicUser(user, provider),
  };
}

function validateRegistration(input: unknown): { name: string; email: string; password: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new MobileAuthError(400, 'Dados de cadastro inválidos.');
  const value = input as Record<string, unknown>;
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : '';
  const password = typeof value.password === 'string' ? value.password : '';
  if (
    Object.keys(value).some(key => !['name', 'email', 'password'].includes(key))
    || name.length < 2 || name.length > 50
    || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || password.length < 6 || password.length > 50 || Buffer.byteLength(password, 'utf8') > 72
  ) throw new MobileAuthError(400, 'Confira nome, e-mail e senha informados.');
  return { name, email, password };
}

function emailInput(input: unknown): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new MobileAuthError(400, 'Informe um e-mail válido.');
  const value = input as Record<string, unknown>;
  const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : '';
  if (Object.keys(value).length !== 1 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new MobileAuthError(400, 'Informe um e-mail válido.');
  }
  return email;
}

function recoveryInput(input: unknown): { token: string; password: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new MobileAuthError(400, 'Confira os campos informados.');
  const value = input as Record<string, unknown>;
  const token = typeof value.token === 'string' ? value.token : '';
  const password = typeof value.password === 'string' ? value.password : '';
  if (
    Object.keys(value).length !== 2
    || !/^[a-f0-9]{64}$/.test(token)
    || password.length < 6 || password.length > 50 || Buffer.byteLength(password, 'utf8') > 72
  ) throw new MobileAuthError(400, 'Confira os campos informados.');
  return { token, password };
}

export class PostgresAccountService {
  constructor(
    private readonly pool: Pool,
    private readonly accessToken: AccessToken,
    private readonly sendMail: SendMail,
    private readonly appUrl: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async login(input: unknown): Promise<LoginResult> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new MobileAuthError(400, 'Confira os campos informados.');
    const value = input as Record<string, unknown>;
    const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : '';
    const password = typeof value.password === 'string' ? value.password : '';
    if (Object.keys(value).length !== 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || Buffer.byteLength(password, 'utf8') > 72) {
      throw new MobileAuthError(400, 'Confira os campos informados.');
    }
    const result = await this.pool.query(
      `SELECT id, name, email, password, image, role, "emailVerified",
              "suspendedAt", "suspendedUntil", "sessionVersion"
       FROM "User" WHERE lower(email) = $1 LIMIT 1`,
      [email],
    );
    const user = result.rows[0] as AccountRow | undefined;
    if (!user?.password || user.emailVerified !== true || !await bcrypt.compare(password, user.password)) {
      throw new MobileAuthError(401, 'Email ou senha inválidos. Verifique seu email.');
    }
    active(user, this.now());
    const token = this.accessToken.issue(user.id, user.sessionVersion, 'credentials');
    return loginResult(user, token, this.now(), 'credentials');
  }

  async register(input: unknown): Promise<{ status: 'success'; message: string }> {
    const { name, email, password } = validateRegistration(input);
    const existing = await this.pool.query(`SELECT id FROM "User" WHERE lower(email) = $1 LIMIT 1`, [email]);
    if (existing.rowCount) throw new MobileAuthError(409, 'O email já está registrado');

    const token = randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO "User" (id, name, email, password, role, "sessionVersion")
         VALUES ($1, $2, $3, $4, 'BASIC', 0)`,
        [userId, name, email, passwordHash],
      );
      await client.query(
        `INSERT INTO "VerificationTokenEmail" (email, token, name, password)
         VALUES ($1, $2, $3, $4)`,
        [email, token, name, passwordHash],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        throw new MobileAuthError(409, 'O email já está registrado');
      }
      throw error;
    } finally {
      client.release();
    }

    await this.deliver(email, 'Confirme seu e-mail no EventMap', `Confirme seu e-mail em até 24 horas: ${this.link('verify', token)}`);
    return { status: 'success', message: 'Verificação de email enviada. Verifique seu email.' };
  }

  async verifyEmail(token: string | null): Promise<{ status: 'success'; message: string }> {
    if (!token || !/^[a-f0-9-]{20,128}$/i.test(token)) throw new MobileAuthError(400, 'Link de verificação inválido ou expirado.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT id, email, "createdAt" FROM "VerificationTokenEmail"
         WHERE token = $1 FOR UPDATE`,
        [token],
      );
      const row = result.rows[0] as { id: number; email: string; createdAt: Date } | undefined;
      if (!row || this.now().getTime() - new Date(row.createdAt).getTime() > verificationLifetimeMs) {
        throw new MobileAuthError(400, 'Link de verificação inválido ou expirado.');
      }
      const claimed = await client.query(
        `DELETE FROM "VerificationTokenEmail" WHERE id = $1 AND token = $2`,
        [row.id, token],
      );
      if (!claimed.rowCount) throw new MobileAuthError(400, 'Link de verificação inválido ou expirado.');
      const updated = await client.query(
        `UPDATE "User" SET "emailVerified" = TRUE WHERE email = $1`,
        [row.email],
      );
      if (!updated.rowCount) throw new MobileAuthError(400, 'Link de verificação inválido ou expirado.');
      await client.query('COMMIT');
      return { status: 'success', message: 'E-mail verificado com sucesso.' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async requestAccountLink(input: unknown, purpose: 'recovery' | 'verification'): Promise<{ message: string }> {
    const email = emailInput(input);
    const generic = { message: genericLinkMessage };
    const userResult = await this.pool.query(
      `SELECT id, email, name, password, "emailVerified"
       FROM "User" WHERE lower(email) = $1 LIMIT 1`,
      [email],
    );
    const user = userResult.rows[0] as { id: string; email: string; name: string | null; password: string | null; emailVerified: boolean | null } | undefined;
    if (!user?.email || !user.password || (purpose === 'verification' && user.emailVerified === true)) return generic;

    const token = purpose === 'recovery' ? randomBytes(32).toString('hex') : randomBytes(32).toString('hex');
    if (purpose === 'verification') {
      await this.pool.query(`DELETE FROM "VerificationTokenEmail" WHERE email = $1`, [user.email]);
      await this.pool.query(
        `INSERT INTO "VerificationTokenEmail" (email, token, name, password)
         VALUES ($1, $2, $3, $4)`,
        [user.email, token, user.name ?? '', user.password],
      );
      await this.deliver(user.email, 'Confirme seu e-mail no EventMap', `Confirme seu e-mail em até 24 horas: ${this.link('verify', token)}`);
      return generic;
    }

    const identifier = `account-recovery:${user.id}`;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM "VerificationToken" WHERE identifier = $1`, [identifier]);
      await client.query(
        `INSERT INTO "VerificationToken" (identifier, token, expires)
         VALUES ($1, $2, $3)`,
        [identifier, hash(token), new Date(this.now().getTime() + recoveryLifetimeMs)],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await this.deliver(user.email, 'Redefina sua senha no EventMap', `Redefina sua senha em até 30 minutos: ${this.link('reset', token)}`);
    return generic;
  }

  async resetPassword(input: unknown): Promise<{ message: string }> {
    const { token, password } = recoveryInput(input);
    const hashed = hash(token);
    const passwordHash = await bcrypt.hash(password, 10);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const storedResult = await client.query(
        `SELECT identifier FROM "VerificationToken"
         WHERE token = $1 AND expires > $2 FOR UPDATE`,
        [hashed, this.now()],
      );
      const identifier = storedResult.rows[0]?.identifier;
      if (typeof identifier !== 'string' || !identifier.startsWith('account-recovery:')) {
        throw new MobileAuthError(400, 'Link inválido ou expirado. Solicite um novo link.');
      }
      const userId = identifier.slice('account-recovery:'.length);
      const deleted = await client.query(
        `DELETE FROM "VerificationToken" WHERE identifier = $1 AND token = $2 AND expires > $3`,
        [identifier, hashed, this.now()],
      );
      const updated = await client.query(
        `UPDATE "User" SET password = $1, "sessionVersion" = "sessionVersion" + 1
         WHERE id = $2 AND password IS NOT NULL`,
        [passwordHash, userId],
      );
      if (!deleted.rowCount || !updated.rowCount) throw new MobileAuthError(400, 'Link inválido ou expirado. Solicite um novo link.');
      await client.query('COMMIT');
      return { message: 'Senha atualizada. Entre com sua nova senha.' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async profile(userId: string): Promise<Record<string, unknown>> {
    const result = await this.pool.query(
      `SELECT id, name, email, image, role, "emailVerified", bio, "contactUrl"
       FROM "User" WHERE id = $1`,
      [userId],
    );
    if (!result.rowCount) throw new MobileAuthError(404, 'Usuário indisponível.');
    return result.rows[0];
  }

  async updateProfile(userId: string, input: unknown): Promise<{ status: 'success'; message: string }> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new MobileAuthError(400, 'Dados inválidos.');
    const value = input as Record<string, unknown>;
    const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : '';
    const name = value.name === undefined ? undefined : typeof value.name === 'string' ? value.name.trim() : null;
    const password = value.password === undefined ? undefined : typeof value.password === 'string' ? value.password : null;
    const newPassword = value.newPassword === undefined ? undefined : typeof value.newPassword === 'string' ? value.newPassword : null;
    if (
      Object.keys(value).some(key => !['email', 'name', 'password', 'newPassword'].includes(key))
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || name === null || (name !== undefined && (name.length < 2 || name.length > 50))
      || password === null || newPassword === null
      || Boolean(password) !== Boolean(newPassword)
      || (newPassword !== undefined && (newPassword.length < 6 || newPassword.length > 50 || Buffer.byteLength(newPassword, 'utf8') > 72))
      || (password !== undefined && Buffer.byteLength(password, 'utf8') > 72)
    ) throw new MobileAuthError(400, 'Confira os campos informados.');

    const result = await this.pool.query(
      `SELECT id, name, email, password FROM "User" WHERE id = $1`,
      [userId],
    );
    const user = result.rows[0] as { id: string; name: string | null; email: string | null; password: string | null } | undefined;
    if (!user || user.email?.toLowerCase() !== email) throw new MobileAuthError(400, 'Não foi possível atualizar este perfil.');

    let passwordHash: string | undefined;
    if (password && newPassword) {
      if (!user.password) throw new MobileAuthError(400, 'Esta conta não permite alterar a senha por este formulário.');
      if (!await bcrypt.compare(password, user.password)) throw new MobileAuthError(400, 'Senha atual incorreta');
      if (await bcrypt.compare(newPassword, user.password)) throw new MobileAuthError(400, 'A nova senha não pode ser igual à senha atual');
      passwordHash = await bcrypt.hash(newPassword, 10);
    }
    const fields: string[] = [];
    const values: unknown[] = [];
    if (name !== undefined && name !== user.name) {
      values.push(name);
      fields.push(`name = $${values.length}`);
    }
    if (passwordHash) {
      values.push(passwordHash);
      fields.push(`password = $${values.length}`);
      fields.push('"sessionVersion" = "sessionVersion" + 1');
    }
    if (!fields.length) throw new MobileAuthError(400, 'Nenhuma alteração foi feita');
    values.push(user.id, user.password);
    const updated = await this.pool.query(
      `UPDATE "User" SET ${fields.join(', ')}
       WHERE id = $${values.length - 1} AND password IS NOT DISTINCT FROM $${values.length}
       RETURNING id`,
      values,
    );
    if (!updated.rowCount) throw new MobileAuthError(409, 'Seu perfil foi alterado em outra solicitação. Atualize a página e tente novamente.');
    return { status: 'success', message: 'Perfil atualizado com sucesso' };
  }

  private async deliver(email: string, subject: string, text: string): Promise<void> {
    try {
      await this.sendMail(email, subject, text);
    } catch (error) {
      console.error('Mobile account email delivery failed:', error instanceof Error ? error.message : 'unknown error');
      throw new MobileAuthError(503, 'O envio de e-mail está temporariamente indisponível. Tente novamente mais tarde.');
    }
  }

  private link(path: 'verify' | 'reset', token: string): string {
    const url = new URL(`/${path}`, this.appUrl);
    url.searchParams.set('token', token);
    return url.href;
  }
}
