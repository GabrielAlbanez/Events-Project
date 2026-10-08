import { createHmac, timingSafeEqual } from 'node:crypto';

const issuer = 'eventmap-mobile-impersonation';
const audience = 'eventmap-mobile-support-session';
const maximumLifetimeSeconds = 15 * 60;
const restoreGraceSeconds = 7 * 24 * 60 * 60;
type Provider = 'credentials' | 'google';

interface ImpersonationClaims {
  iss: string;
  aud: string;
  sub: string;
  ver: number;
  provider: Provider;
  iat: number;
  exp: number;
  imp: string;
  adm: string;
  admVer: number;
  admProvider: Provider;
}

export interface VerifiedImpersonationToken {
  subject: string;
  sessionVersion: number;
  provider: Provider;
  sessionId: string;
  adminId: string;
  adminSessionVersion: number;
  adminProvider: Provider;
  expiresAt: Date;
}

function encode(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function signature(input: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(input).digest();
}

function provider(value: unknown): value is Provider {
  return value === 'credentials' || value === 'google';
}

export function createImpersonationToken(
  secret: string,
  now: () => number = Date.now,
) {
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('Configure MOBILE_AUTH_SECRET com pelo menos 32 bytes.');
  }
  return {
    issue(input: {
      userId: string;
      sessionVersion: number;
      provider: Provider;
      sessionId: string;
      adminId: string;
      adminSessionVersion: number;
      adminProvider: Provider;
      expiresAt: Date;
    }): string {
      const issuedAt = Math.floor(now() / 1000);
      const expiresAt = Math.floor(input.expiresAt.getTime() / 1000);
      if (
        !input.userId
        || !input.sessionId
        || !input.adminId
        || !Number.isInteger(input.sessionVersion)
        || !Number.isInteger(input.adminSessionVersion)
        || !provider(input.provider)
        || !provider(input.adminProvider)
        || expiresAt <= issuedAt
        || expiresAt - issuedAt > maximumLifetimeSeconds
      ) {
        throw new Error('Invalid impersonation token input.');
      }
      const header = encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const claims: ImpersonationClaims = {
        iss: issuer,
        aud: audience,
        sub: input.userId,
        ver: input.sessionVersion,
        provider: input.provider,
        iat: issuedAt,
        exp: expiresAt,
        imp: input.sessionId,
        adm: input.adminId,
        admVer: input.adminSessionVersion,
        admProvider: input.adminProvider,
      };
      const payload = encode(JSON.stringify(claims));
      const unsigned = `${header}.${payload}`;
      return `${unsigned}.${signature(unsigned, secret).toString('base64url')}`;
    },
    verify(token: string, allowExpiredForRestore = false): VerifiedImpersonationToken {
      if (token.length > 8192) throw new Error('Invalid impersonation token.');
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Invalid impersonation token.');
      const [headerValue, payloadValue, signatureValue] = parts;
      let header: unknown;
      let claimsValue: unknown;
      try {
        header = JSON.parse(Buffer.from(headerValue, 'base64url').toString('utf8')) as unknown;
        claimsValue = JSON.parse(Buffer.from(payloadValue, 'base64url').toString('utf8')) as unknown;
      } catch {
        throw new Error('Invalid impersonation token.');
      }
      if (!header || typeof header !== 'object' || !('alg' in header) || header.alg !== 'HS256') {
        throw new Error('Invalid impersonation token.');
      }
      const expected = signature(`${headerValue}.${payloadValue}`, secret);
      const actual = Buffer.from(signatureValue, 'base64url');
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        throw new Error('Invalid impersonation token.');
      }
      if (!claimsValue || typeof claimsValue !== 'object') throw new Error('Invalid impersonation token.');
      const claims = claimsValue as Partial<ImpersonationClaims>;
      const current = Math.floor(now() / 1000);
      if (
        claims.iss !== issuer
        || claims.aud !== audience
        || typeof claims.sub !== 'string'
        || !claims.sub
        || !Number.isInteger(claims.ver)
        || !provider(claims.provider)
        || !Number.isInteger(claims.iat)
        || !Number.isInteger(claims.exp)
        || claims.iat! > current + 60
        || (claims.exp! <= current
          && (!allowExpiredForRestore || current - claims.exp! > restoreGraceSeconds))
        || claims.exp! - claims.iat! > maximumLifetimeSeconds
        || typeof claims.imp !== 'string'
        || !claims.imp
        || typeof claims.adm !== 'string'
        || !claims.adm
        || !Number.isInteger(claims.admVer)
        || !provider(claims.admProvider)
      ) {
        throw new Error('Invalid impersonation token.');
      }
      return {
        subject: claims.sub,
        sessionVersion: claims.ver!,
        provider: claims.provider,
        sessionId: claims.imp,
        adminId: claims.adm,
        adminSessionVersion: claims.admVer!,
        adminProvider: claims.admProvider,
        expiresAt: new Date(claims.exp! * 1000),
      };
    },
  };
}
