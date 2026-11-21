import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { sendVerificationEmail } from "@/lib/mail/verification";
import { sendAccountExistsEmail } from "@/lib/mail/accountExists";
import { isMailConfigured } from "@/lib/mail/transport";
import { registerAccountInputSchema } from "@/schemas/accountInput";
import { publicSiteUrl } from "@/lib/publicUrl";
import { consumeRateLimit, rateLimitBuckets, requestClientKey } from "@/lib/rateLimit";

export interface RegisterUserInput {
  name: string;
  email: string;
  password: string;
}

export type RegisterErrorCode = "invalid" | "rate_limited" | "unavailable";
export type RegisterResult =
  | { status: "success"; message: string }
  | { status: "error"; code: RegisterErrorCode; error: string };

/** Same answer whether or not the e-mail already has an account (anti-enumeration). */
export const REGISTER_SUCCESS_MESSAGE = "Enviamos as instruções para o e-mail informado. Confira sua caixa de entrada e o spam.";
const RATE_LIMITED = "Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente.";
const UNAVAILABLE = "Não foi possível concluir o cadastro agora. Tente novamente em instantes.";
const MAIL_UNAVAILABLE = "O envio de e-mail está temporariamente indisponível. Tente novamente mais tarde.";

type Delivery =
  | { kind: "limited" }
  | { kind: "verify"; email: string; token: string }
  | { kind: "exists"; email: string }
  | { kind: "none" };

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "P2002";
}

export async function registerUser(data: RegisterUserInput, clientKey?: string): Promise<RegisterResult> {
  const parsed = registerAccountInputSchema.safeParse(data);
  if (!parsed.success) {
    return { status: "error", code: "invalid", error: parsed.error.issues[0]?.message ?? "Dados de cadastro inválidos." };
  }
  if (!isMailConfigured()) return { status: "error", code: "unavailable", error: MAIL_UNAVAILABLE };

  const { name, email, password } = parsed.data;
  let delivery: Delivery;
  try {
    const buckets = rateLimitBuckets("register", email, clientKey ?? await requestClientKey());
    // Hash for every attempt so new and existing e-mails take a similar time.
    const passwordHash = await bcrypt.hash(password, 10);
    const token = uuidv4();
    delivery = await prisma.$transaction(async (transaction): Promise<Delivery> => {
      // The e-mail bucket lock also serializes concurrent sign-ups for the same address.
      if (!await consumeRateLimit(transaction, "register", buckets)) return { kind: "limited" };
      const existing = await transaction.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { email: true, password: true, emailVerified: true, name: true },
      });
      if (existing?.email) {
        if (existing.password && !existing.emailVerified) {
          // Pending sign-up: resend confirmation without replacing the stored password.
          await transaction.verificationTokenEmail.deleteMany({ where: { email: existing.email } });
          await transaction.verificationTokenEmail.create({ data: { name: existing.name ?? name, email: existing.email, token, password: existing.password } });
          return { kind: "verify", email: existing.email, token };
        }
        return { kind: "exists", email: existing.email };
      }
      await transaction.user.create({ data: { name, email, password: passwordHash } });
      await transaction.verificationTokenEmail.create({ data: { name, email, token, password: passwordHash } });
      return { kind: "verify", email, token };
    }, { timeout: 15000 });
  } catch (error) {
    // A concurrent request created the same account first: answer as if it existed.
    if (isUniqueViolation(error)) delivery = { kind: "none" };
    else return { status: "error", code: "unavailable", error: UNAVAILABLE };
  }

  if (delivery.kind === "limited") return { status: "error", code: "rate_limited", error: RATE_LIMITED };
  try {
    const site = publicSiteUrl();
    if (delivery.kind === "verify") {
      const verificationUrl = new URL("/verifyEmail", site);
      verificationUrl.searchParams.set("token", delivery.token);
      await sendVerificationEmail(delivery.email, verificationUrl.href);
    } else if (delivery.kind === "exists") {
      await sendAccountExistsEmail(delivery.email, { login: new URL("/login", site).href, recovery: new URL("/recuperar-senha", site).href });
    }
  } catch {
    // SMTP details stay on the server; the user can resend from /confirmar-email.
    console.warn("Registration e-mail delivery unavailable.");
    return { status: "error", code: "unavailable", error: MAIL_UNAVAILABLE };
  }
  return { status: "success", message: REGISTER_SUCCESS_MESSAGE };
}
