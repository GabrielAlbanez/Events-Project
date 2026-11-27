import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";

/** Server-only secrets for ticket sales. Never log or return the values read here. */
type Env = Record<string, string | undefined>;

export class TicketConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TicketConfigError";
  }
}

const TOKEN_VERSION = "v1";
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
/** Webhook signatures older (or further in the future) than this are replays and are rejected. */
export const WEBHOOK_MAX_SKEW_MS = 10 * 60 * 1000;

function decodeKey(value: string | undefined): Buffer | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  if (/^[A-Za-z0-9+/_-]{43,44}={0,2}$/.test(raw)) {
    const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (decoded.length === 32) return decoded;
  }
  return null;
}

/** 32-byte key (hex or base64). Throws a config error that never echoes the value. */
export function readTicketEncryptionKey(env: Env = process.env): Buffer {
  const key = decodeKey(env.TICKETS_ENCRYPTION_KEY);
  if (!key) throw new TicketConfigError("TICKETS_ENCRYPTION_KEY ausente ou inválida: use 32 bytes em hex (64 caracteres) ou base64.");
  return key;
}

/** True only when every server variable needed to sell tickets is present and valid. */
export function ticketPaymentsConfigured(env: Env = process.env): boolean {
  return Boolean(env.MP_CLIENT_ID?.trim() && env.MP_CLIENT_SECRET?.trim() && env.MP_WEBHOOK_SECRET?.trim() && decodeKey(env.TICKETS_ENCRYPTION_KEY));
}

/** AES-256-GCM: "v1:" + base64url(iv | tag | ciphertext). */
export function encryptTicketToken(plain: string, env: Env = process.env): string {
  const key = readTicketEncryptionKey(env);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${TOKEN_VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url")}`;
}

export function decryptTicketToken(sealed: string, env: Env = process.env): string {
  const key = readTicketEncryptionKey(env);
  const [version, body, extra] = sealed.split(":");
  if (version !== TOKEN_VERSION || !body || extra !== undefined) throw new Error("INVALID_SEALED_TOKEN");
  const raw = Buffer.from(body, "base64url");
  if (raw.length < 29) throw new Error("INVALID_SEALED_TOKEN");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Mercado Pago webhook signature: header `x-signature: ts=<ts>,v1=<hmac>`; manifest
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` signed with HMAC-SHA256 and the webhook secret.
 * Alphanumeric data ids are lowercased, and absent parts are left out of the manifest (MP docs).
 * `ts` must be within WEBHOOK_MAX_SKEW_MS of now; Mercado Pago sends milliseconds, but seconds are accepted too.
 */
export function verifyMercadoPagoSignature(input: { xSignature: string | null | undefined; xRequestId: string | null | undefined; dataId: string | null | undefined; secret: string | null | undefined; now?: Date }): boolean {
  if (!input.secret || !input.xSignature || input.xSignature.length > 512) return false;
  const parts = Object.fromEntries(input.xSignature.split(",").map((part) => {
    const [name, ...rest] = part.split("=");
    return [name.trim(), rest.join("=").trim()];
  }));
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !/^\d{1,20}$/.test(ts) || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return false;
  const tsNumber = Number(ts);
  const tsMs = tsNumber > 1e12 ? tsNumber : tsNumber * 1000;
  if (!Number.isFinite(tsMs) || Math.abs((input.now ?? new Date()).getTime() - tsMs) > WEBHOOK_MAX_SKEW_MS) return false;
  let manifest = "";
  if (input.dataId) manifest += `id:${/^[a-z0-9]+$/i.test(input.dataId) ? input.dataId.toLowerCase() : input.dataId};`;
  if (input.xRequestId) manifest += `request-id:${input.xRequestId};`;
  manifest += `ts:${ts};`;
  const expected = createHmac("sha256", input.secret).update(manifest).digest("hex");
  return safeEqual(expected, v1.toLowerCase());
}

/** `Authorization: Bearer <secret>` check for internal routes (Vercel Cron). False when the secret is not set. */
export function verifyBearerSecret(header: string | null | undefined, secret: string | null | undefined): boolean {
  const expected = secret?.trim();
  if (!expected || expected.length < 16 || !header || header.length > 1024) return false;
  const match = /^Bearer (.+)$/.exec(header);
  return match !== null && safeEqual(match[1], expected);
}

function stateSecret(env: Env): string {
  const secret = env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) throw new TicketConfigError("NEXTAUTH_SECRET ausente ou curto demais para assinar a conexão.");
  return secret;
}

const stateSignature = (payload: string, secret: string) => createHmac("sha256", secret).update(`eventmap-mp-oauth-v1:${payload}`).digest("base64url");

/** OAuth `state`: userId + nonce + expiry, signed with NEXTAUTH_SECRET (CSRF protection bound to the session user). */
export function signOAuthState(userId: string, env: Env = process.env, now: Date = new Date()): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, n: randomBytes(12).toString("base64url"), e: now.getTime() + OAUTH_STATE_TTL_MS })).toString("base64url");
  return `${payload}.${stateSignature(payload, stateSecret(env))}`;
}

export function verifyOAuthState(state: unknown, userId: string, env: Env = process.env, now: Date = new Date()): boolean {
  if (typeof state !== "string" || state.length > 512) return false;
  const [payload, signature, extra] = state.split(".");
  if (!payload || !signature || extra !== undefined) return false;
  let secret: string;
  try { secret = stateSecret(env); } catch { return false; }
  if (!safeEqual(stateSignature(payload, secret), signature)) return false;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    return claims.u === userId && typeof claims.e === "number" && claims.e > now.getTime() && typeof claims.n === "string";
  } catch {
    return false;
  }
}

/** Stored as the token expiry when Mercado Pago ended the authorization and the seller must reconnect. */
export const SELLER_RECONNECT_MARK = new Date(0);

/** Whether this seller can receive payments now. A paid event without it is paused, never free. */
export async function sellerAccountActive(db: Pick<Prisma.TransactionClient, "mercadoPagoAccount">, sellerId: string | null): Promise<boolean> {
  if (!sellerId) return false;
  const account = await db.mercadoPagoAccount.findUnique({ where: { userId: sellerId }, select: { expiresAt: true } });
  return Boolean(account && new Date(account.expiresAt).getTime() > SELLER_RECONNECT_MARK.getTime());
}
