export type Role = 'BASIC' | 'PROMOTER' | 'ADMIN';

export interface MobileUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: Role;
  emailVerified: boolean | null;
  suspendedAt: Date | null;
  suspendedUntil: Date | null;
  sessionVersion: number;
}

export interface GoogleProfile {
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  image: string | null;
}

export interface MobileAuthRepository {
  findGoogleAccount(subject: string): Promise<MobileUser | null>;
  findUserByEmail(email: string): Promise<MobileUser | null>;
  createGoogleAccount(profile: GoogleProfile): Promise<MobileUser>;
  findUserById(id: string): Promise<MobileUser | null>;
}

export interface AccessToken {
  issue(userId: string, sessionVersion: number, provider?: 'credentials' | 'google'): string;
  verify(token: string): { subject: string; sessionVersion: number; provider: 'credentials' | 'google' };
}

export interface LoginResult {
  token: string;
  expiresAt: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    role: Role;
    emailVerified: boolean | null;
    provider: 'credentials' | 'google';
  };
}

export class MobileAuthError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'MobileAuthError';
  }
}

export class GoogleAccountConflictError extends Error {
  constructor() {
    super('Google account already exists.');
    this.name = 'GoogleAccountConflictError';
  }
}

function userResponse(user: MobileUser, provider: 'credentials' | 'google'): LoginResult['user'] {
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

function assertActive(user: MobileUser, now: Date): void {
  if (user.suspendedAt && (!user.suspendedUntil || user.suspendedUntil > now)) {
    throw new MobileAuthError(403, 'Esta conta está suspensa.');
  }
}

function loginResult(user: MobileUser, token: string, now: Date, provider: 'credentials' | 'google'): LoginResult {
  return {
    token,
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    user: userResponse(user, provider),
  };
}

export function createMobileAuthService(
  dependencies: {
    repository: MobileAuthRepository;
    accessToken: AccessToken;
    now?: () => Date;
  },
) {
  const now = dependencies.now ?? (() => new Date());

  return {
    async googleLogin(profile: GoogleProfile): Promise<LoginResult> {
      if (!profile.subject || !profile.email || !profile.emailVerified) {
        throw new MobileAuthError(401, 'Use uma conta Google com email verificado.');
      }

      const normalizedProfile = { ...profile, email: profile.email.trim().toLowerCase() };
      let user = await dependencies.repository.findGoogleAccount(normalizedProfile.subject);
      if (!user) {
        const existingEmail = await dependencies.repository.findUserByEmail(normalizedProfile.email);
        if (existingEmail) {
          throw new MobileAuthError(409, 'Este email já usa outro método de login.');
        }

        try {
          user = await dependencies.repository.createGoogleAccount(normalizedProfile);
        } catch (error) {
          if (!(error instanceof GoogleAccountConflictError)) throw error;
          user = await dependencies.repository.findGoogleAccount(normalizedProfile.subject);
          if (!user) {
            throw new MobileAuthError(409, 'Não foi possível associar esta conta Google. Tente novamente.');
          }
        }
      }

      const issuedAt = now();
      assertActive(user, issuedAt);
      const token = dependencies.accessToken.issue(user.id, user.sessionVersion, 'google');
      return loginResult(user, token, issuedAt, 'google');
    },

    async currentUser(token: string): Promise<LoginResult['user']> {
      let claims: ReturnType<AccessToken['verify']>;
      try {
        claims = dependencies.accessToken.verify(token);
      } catch {
        throw new MobileAuthError(401, 'Entre novamente na sua conta.');
      }

      const user = await dependencies.repository.findUserById(claims.subject);
      if (!user || user.sessionVersion !== claims.sessionVersion) {
        throw new MobileAuthError(401, 'Sua sessão foi encerrada. Entre novamente.');
      }
      assertActive(user, now());
      return userResponse(user, claims.provider);
    },
  };
}
