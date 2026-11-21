import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";
import type { User } from "@prisma/client";
import { isAccountSuspended } from "@/lib/auth/accountAccess";
import { credentialsErrorMessages, type CredentialsErrorCode } from "@/lib/auth/errorMessages";
import { clearRateLimit, normalizeEmail, rateLimitBuckets, releaseRateLimitHit, requestClientKey, reserveRateLimitHit } from "@/lib/rateLimit";

export interface LoginUserInputData {
  email: string;
  password: string;
}

export type { CredentialsErrorCode } from "@/lib/auth/errorMessages";
export { credentialsErrorMessages };

export type CredentialsResult =
  | { status: "success"; user: User }
  | { status: "error"; code: CredentialsErrorCode };

// Valid bcrypt hash (cost 10) of a random discarded value. Comparing against it when the
// account does not exist keeps the response time close to a real password check.
const TIMING_EQUALIZER_HASH = "$2b$10$bwKGlsUx5VB6lMKOl/BAGu5ujHjfAbvqdUJxNCJjwB7BwWzlKNtgS";
const MAX_PASSWORD_BYTES = 72;

/**
 * Finds an account by e-mail regardless of letter case. New accounts are stored in
 * lowercase; legacy mixed-case rows still match. If legacy rows differ only by case,
 * the exact typed spelling wins, then the lowercase one.
 */
export async function findUserByLoginEmail(email: string): Promise<User | null> {
  const typed = email.trim();
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const candidates = await prisma.user.findMany({
    where: { email: { equals: normalized, mode: "insensitive" } },
    take: 5,
  });
  return candidates.find(user => user.email === typed)
    ?? candidates.find(user => user.email === normalized)
    ?? candidates[0]
    ?? null;
}

/**
 * Single credentials pipeline for NextAuth `authorize` and the legacy server action.
 * Order matters: rate limit, then password, and only then the account state, so the
 * answer never reveals whether an e-mail is registered, verified or OAuth-only.
 */
export async function authenticateCredentials(input: LoginUserInputData, clientKey: string): Promise<CredentialsResult> {
  const email = typeof input?.email === "string" ? input.email : "";
  const password = typeof input?.password === "string" ? input.password : "";
  if (!normalizeEmail(email) || !password || Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    return { status: "error", code: "CredentialsSignin" };
  }
  try {
    const buckets = rateLimitBuckets("login", email, clientKey);
    // Reserved before bcrypt, so a parallel burst cannot all pass a stale count.
    const reserved = await reserveRateLimitHit(prisma, "login", buckets);
    if (!reserved) return { status: "error", code: "RateLimited" };
    const user = await findUserByLoginEmail(email);
    const passwordValid = await bcrypt.compare(password, user?.password || TIMING_EQUALIZER_HASH);
    // A wrong password keeps the reserved row: it is the recorded failure.
    if (!user || !user.password || !passwordValid) return { status: "error", code: "CredentialsSignin" };
    // The right password never counts as a failure, even for unverified/suspended accounts.
    await releaseRateLimitHit(prisma, reserved).catch(() => undefined);
    if (!user.emailVerified) return { status: "error", code: "EmailNotVerified" };
    if (isAccountSuspended(user)) return { status: "error", code: "AccountSuspended" };
    await clearRateLimit(prisma, buckets).catch(() => undefined);
    return { status: "success", user };
  } catch {
    // Never forward database details to the browser through NextAuth's error code.
    console.error("Credentials authentication unavailable.");
    return { status: "error", code: "ServiceUnavailable" };
  }
}

/** Legacy server action contract (`app/(actions)/Login`), now uniform and rate limited. */
export async function validateUser(data: LoginUserInputData, clientKey?: string) {
  const result = await authenticateCredentials(data, clientKey ?? await requestClientKey());
  if (result.status === "error") return { status: "error" as const, code: result.code, error: credentialsErrorMessages[result.code] };
  const { user } = result;
  return { status: "success" as const, user: { id: user.id, name: user.name, email: user.email, image: user.image } };
}
