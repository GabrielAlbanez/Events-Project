import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import prisma from "@/lib/prisma";
import { transact, CommunityError } from "@/lib/community/common";
import { sendRecoveryEmail } from "@/lib/mail/recovery";
import { sendVerificationEmail } from "@/lib/mail/verification";
import { resetPasswordSchema } from "@/schemas/passwordRecovery";

const genericMessage = "Se a conta puder receber este link, enviaremos as instruções por e-mail. Confira também o spam.";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type Purpose = "recovery" | "verification";

function baseUrl(): string {
  const url = new URL(process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000");
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("SECURE_MAIL_ORIGIN_REQUIRED");
  return url.origin;
}

// Persisted buckets are separate from authentication tokens. Proxy IP headers are
// trusted only when the deployment explicitly opts in; otherwise use a global bucket.
export async function requestAccountLink(email: string, purpose: Purpose, clientKey: string): Promise<{ message: string }> {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) throw new CommunityError(503, "O envio de e-mail está temporariamente indisponível. Tente novamente mais tarde.");
  const origin = baseUrl();
  const normalized = email.trim().toLowerCase();
  const now = new Date();
  const window = Math.floor(now.getTime() / 3600000);
  const rawToken = randomBytes(32).toString("hex");
  const delivery = await transact(async tx => {
    const keys = [
      { identifier: `account-rate:email:${hash(normalized)}:${window}`, limit: 3 },
      { identifier: `account-rate:client:${hash(clientKey)}:${window}`, limit: clientKey === "global" ? 100 : 20 },
    ].sort((a, b) => a.identifier.localeCompare(b.identifier));
    for (const bucket of keys) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${bucket.identifier}, 0))`;
      if (await tx.verificationToken.count({ where: { identifier: bucket.identifier } }) >= bucket.limit) return null;
    }
    for (const bucket of keys) await tx.verificationToken.create({ data: {
      identifier: bucket.identifier, token: `rate:${randomBytes(24).toString("hex")}`, expires: new Date(now.getTime() + 3600000),
    } });
    await tx.verificationToken.deleteMany({ where: { identifier: { startsWith: "account-rate:" }, expires: { lt: now } } });
    const user = await tx.user.findFirst({ where: { email: { equals: normalized, mode: "insensitive" } }, select: { id: true, email: true, password: true, emailVerified: true, name: true } });
    if (!user?.email || !user.password || (purpose === "verification" && user.emailVerified)) return null;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`account-link:${user.id}`}, 0))`;
    if (purpose === "recovery") {
      const identifier = `account-recovery:${user.id}`;
      await tx.verificationToken.deleteMany({ where: { identifier } });
      await tx.verificationToken.create({ data: { identifier, token: hash(rawToken), expires: new Date(now.getTime() + 30 * 60000) } });
    } else {
      await tx.verificationTokenEmail.deleteMany({ where: { email: user.email } });
      await tx.verificationTokenEmail.create({ data: { email: user.email, name: user.name ?? "", password: user.password, token: rawToken } });
    }
    return user.email;
  });
  if (delivery) {
    try {
      if (purpose === "recovery") await sendRecoveryEmail(delivery, `${origin}/redefinir-senha?token=${rawToken}`);
      else await sendVerificationEmail(delivery, `${origin}/verifyEmail?token=${rawToken}`);
    } catch {
      // Never leak SMTP errors or reveal whether an account exists.
      console.warn("Account link delivery unavailable.");
    }
  }
  return { message: genericMessage };
}

export async function resetAccountPassword(input: unknown): Promise<{ message: string }> {
  const { token, password } = resetPasswordSchema.parse(input);
  await transact(async tx => {
    const stored = await tx.verificationToken.findUnique({ where: { token: hash(token) } });
    if (!stored || !stored.identifier.startsWith("account-recovery:") || stored.expires.getTime() <= Date.now()) throw new CommunityError(400, "Link inválido ou expirado. Solicite um novo link.");
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = stored.identifier.slice("account-recovery:".length);
    const claimed = await tx.verificationToken.deleteMany({ where: { token: hash(token), identifier: stored.identifier, expires: { gt: new Date() } } });
    if (!claimed.count) throw new CommunityError(400, "Link inválido ou expirado. Solicite um novo link.");
    const updated = await tx.user.updateMany({ where: { id: userId, password: { not: null } }, data: { password: passwordHash } });
    if (!updated.count) throw new CommunityError(400, "Link inválido ou expirado. Solicite um novo link.");
    await tx.communitySignal.create({ data: { room: `user:${userId}` } });
  });
  return { message: "Senha atualizada. Entre com sua nova senha." };
}
