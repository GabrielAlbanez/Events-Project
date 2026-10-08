import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AccessToken } from './auth-service';

const issuer = 'eventmap-mobile-api';
const audience = 'eventmap-mobile';
const lifetimeSeconds = 7 * 24 * 60 * 60;
type Provider = 'credentials' | 'google';

interface Claims {
  iss: string;
  aud: string;
  sub: string;
  ver: number;
  provider: Provider;
  iat: number;
  exp: number;
}

function encode(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function decodeJson(value: string): unknown {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
}

function signature(input: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(input).digest();
}

export function createAccessToken(secret: string, now: () => number = Date.now): AccessToken {
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('Configure MOBILE_AUTH_SECRET com pelo menos 32 bytes.');
  }

  return {
    issue(userId, sessionVersion, provider = 'google') {
      const issuedAt = Math.floor(now() / 1000);
      const header = encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = encode(JSON.stringify({
        iss: issuer,
        aud: audience,
        sub: userId,
        ver: sessionVersion,
        provider,
        iat: issuedAt,
        exp: issuedAt + lifetimeSeconds,
      } satisfies Claims));
      const unsigned = `${header}.${payload}`;
      return `${unsigned}.${signature(unsigned, secret).toString('base64url')}`;
    },
    verify(token) {
      if (token.length > 8192) throw new Error('Invalid access token.');
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Invalid access token.');

      const [encodedHeader, encodedPayload, encodedSignature] = parts;
      const header = decodeJson(encodedHeader);
      const claims = decodeJson(encodedPayload);
      if (!header || typeof header !== 'object' || !('alg' in header) || header.alg !== 'HS256') {
        throw new Error('Invalid access token.');
      }
      const expected = signature(`${encodedHeader}.${encodedPayload}`, secret);
      const actual = Buffer.from(encodedSignature, 'base64url');
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        throw new Error('Invalid access token.');
      }
      if (!claims || typeof claims !== 'object') throw new Error('Invalid access token.');
      const value = claims as Partial<Claims>;
      const current = Math.floor(now() / 1000);
      if (
        value.iss !== issuer
        || value.aud !== audience
        || typeof value.sub !== 'string'
        || !value.sub
        || !Number.isInteger(value.ver)
        || (value.provider !== 'credentials' && value.provider !== 'google')
        || !Number.isInteger(value.iat)
        || !Number.isInteger(value.exp)
        || value.iat! > current + 60
        || value.exp! <= current
        || value.exp! - value.iat! > lifetimeSeconds
      ) {
        throw new Error('Invalid access token.');
      }
      return { subject: value.sub, sessionVersion: value.ver!, provider: value.provider };
    },
  };
}
