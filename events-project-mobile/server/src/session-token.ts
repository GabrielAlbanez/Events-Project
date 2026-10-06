import type { JWT } from 'next-auth/jwt';
/** Change only the view; original admin authentication remains immutable. */
export function impersonationToken(original: JWT, impersonationId: string | null): JWT {
  const updated = { ...original };
  if (impersonationId) updated.impersonationId = impersonationId;
  else {
    for (const field of ['impersonationId', 'impersonationView', 'effectiveName', 'effectiveEmail', 'effectiveImage', 'effectiveEmailVerified']) delete updated[field];
    updated.effectiveUserId = original.id;
    updated.effectiveRole = original.role;
    updated.accountBlocked = false;
  }
  return updated;
}
