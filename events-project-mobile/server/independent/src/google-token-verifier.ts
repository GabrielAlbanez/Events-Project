import type { OAuth2Client } from 'google-auth-library';
import { MobileAuthError, type GoogleProfile } from './auth-service';

export function createGoogleTokenVerifier(client: Pick<OAuth2Client, 'verifyIdToken'>, audiences: string[]) {
  return async (idToken: string): Promise<GoogleProfile> => {
    if (!audiences.length) throw new MobileAuthError(503, 'Login Google ainda não foi configurado no servidor.');
    // google-auth-library verifies signature, expiry, issuer and the allowed audience.
    let ticket;
    try {
      ticket = await client.verifyIdToken({ idToken, audience: audiences });
    } catch {
      throw new MobileAuthError(401, 'Não foi possível validar seu login Google.');
    }
    const payload = ticket.getPayload();
    if (!payload || !audiences.includes(payload.aud)
      || !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)
      || !Number.isFinite(payload.exp) || payload.exp <= Date.now() / 1000) {
      throw new MobileAuthError(401, 'Credencial Google inválida ou expirada.');
    }
    if (!payload.sub || !payload.email || payload.email_verified !== true) {
      throw new MobileAuthError(401, 'Use uma conta Google com email verificado.');
    }
    return { subject: payload.sub, email: payload.email, emailVerified: true,
      name: payload.name ?? null, image: payload.picture ?? null };
  };
}
