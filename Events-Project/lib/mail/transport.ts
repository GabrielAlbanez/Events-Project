import nodemailer, { type Transporter } from "nodemailer";

/**
 * Single e-mail transport for the web app.
 *
 * - SMTP_HOST set: generic SMTP (Resend, SES, Postmark, Mailgun...) using SMTP_PORT,
 *   SMTP_SECURE, SMTP_USER, SMTP_PASS and MAIL_FROM.
 * - SMTP_HOST unset: the previous Gmail preset with EMAIL_USER/EMAIL_PASS, unchanged.
 */
export type MailTransportConfig =
  | { kind: "smtp"; host: string; port: number; secure: boolean; user: string | null; pass: string | null; from: string }
  | { kind: "gmail"; user: string; pass: string; from: string };

type MailEnv = Partial<Record<"SMTP_HOST" | "SMTP_PORT" | "SMTP_SECURE" | "SMTP_USER" | "SMTP_PASS" | "MAIL_FROM" | "EMAIL_USER" | "EMAIL_PASS", string | undefined>> & Record<string, string | undefined>;

const TIMEOUTS = { connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 } as const;

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

/** Returns null when nothing usable is configured. Never includes secrets in errors. */
export function resolveMailConfig(env: MailEnv = process.env): MailTransportConfig | null {
  const host = clean(env.SMTP_HOST);
  if (host) {
    const secureFlag = clean(env.SMTP_SECURE).toLowerCase();
    const rawPort = clean(env.SMTP_PORT);
    const port = rawPort ? Number(rawPort) : secureFlag === "true" ? 465 : 587;
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    const secure = secureFlag ? secureFlag === "true" : port === 465;
    const user = clean(env.SMTP_USER) || null;
    const pass = env.SMTP_PASS ? env.SMTP_PASS : null;
    if (user && !pass) return null;
    const from = clean(env.MAIL_FROM) || user || "";
    if (!from) return null;
    return { kind: "smtp", host, port, secure, user, pass, from };
  }
  const user = clean(env.EMAIL_USER);
  const pass = env.EMAIL_PASS ?? "";
  if (!user || !pass) return null;
  return { kind: "gmail", user, pass, from: clean(env.MAIL_FROM) || user };
}

export function isMailConfigured(): boolean {
  return resolveMailConfig() !== null;
}

let cached: { key: string; transporter: Transporter } | null = null;

function transportFor(config: MailTransportConfig): Transporter {
  const key = JSON.stringify(config);
  if (cached?.key === key) return cached.transporter;
  const transporter = config.kind === "smtp"
    ? nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      // Production refuses plaintext SMTP; local catchers such as Mailpit may run without TLS.
      requireTLS: !config.secure && process.env.NODE_ENV === "production",
      ...(config.user && config.pass ? { auth: { user: config.user, pass: config.pass } } : {}),
      ...TIMEOUTS,
    })
    : nodemailer.createTransport({ service: "gmail", auth: { user: config.user, pass: config.pass }, ...TIMEOUTS });
  cached = { key, transporter };
  return transporter;
}

export class MailUnavailableError extends Error {
  constructor() { super("MAIL_NOT_CONFIGURED"); }
}

export type MailMessage = { to: string | string[]; bcc?: string[]; subject: string; text: string; html?: string };

/** Sends one message. Header values are stripped of line breaks to prevent header injection. */
export async function sendMail(message: MailMessage): Promise<void> {
  const config = resolveMailConfig();
  if (!config) throw new MailUnavailableError();
  const subject = message.subject.replace(/[\r\n]+/g, " ").slice(0, 150);
  await transportFor(config).sendMail({
    from: config.from,
    to: message.to,
    ...(message.bcc?.length ? { bcc: message.bcc } : {}),
    subject,
    text: message.text,
    ...(message.html ? { html: message.html } : {}),
  });
}
