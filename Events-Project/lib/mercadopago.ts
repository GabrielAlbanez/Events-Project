/**
 * Minimal Mercado Pago client (marketplace OAuth + Pix payments) with injectable fetch.
 * Errors carry only a short code and the HTTP status: never tokens, secrets or provider bodies.
 */
type Env = Record<string, string | undefined>;
export type MpFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type MercadoPagoConfig = { clientId: string; clientSecret: string; redirectUri: string; apiBase: string; authBase: string };
export type MercadoPagoTokens = { accessToken: string; refreshToken: string; expiresInSeconds: number; mpUserId: string };
export type PixPaymentInput = {
  orderId: string; amountCents: number; feeCents: number; description: string; payerEmail: string;
  notificationUrl: string | null; expiresAt: Date;
};
export type PixPayment = { paymentId: string; status: string; qrCode: string; qrCodeBase64: string };
export type MercadoPagoPayment = {
  id: string; status: string; externalReference: string | null; amountCents: number | null;
  currencyId: string | null;
  /** Marketplace fee as reported by Mercado Pago (top-level `application_fee` or a `fee_details` entry); null when absent. */
  applicationFeeCents: number | null;
};

const TIMEOUT_MS = 10_000;

export class MercadoPagoError extends Error {
  constructor(readonly code: string, readonly status: number | null = null) {
    super(`mercadopago:${code}${status ? `:${status}` : ""}`);
    this.name = "MercadoPagoError";
  }
}

const trimSlash = (value: string) => value.replace(/\/+$/, "");

const MP_API_BASE = "https://api.mercadopago.com";
const MP_AUTH_BASE = "https://auth.mercadopago.com";

/**
 * Null when the app credentials are missing. MP_API_BASE_URL / MP_AUTH_BASE_URL exist only for isolated tests and are
 * ignored on the Vercel production deployment, so a stray variable can never send seller tokens to another host.
 */
export function mercadoPagoConfig(env: Env = process.env): MercadoPagoConfig | null {
  const clientId = env.MP_CLIENT_ID?.trim();
  const clientSecret = env.MP_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const site = trimSlash(env.NEXTAUTH_URL?.trim() || env.NEXT_PUBLIC_BASE_URL?.trim() || "http://localhost:3000");
  const overridable = env.VERCEL_ENV !== "production";
  return {
    clientId, clientSecret,
    redirectUri: env.MP_REDIRECT_URI?.trim() || `${site}/api/mercadopago/callback`,
    apiBase: trimSlash((overridable && env.MP_API_BASE_URL?.trim()) || MP_API_BASE),
    authBase: trimSlash((overridable && env.MP_AUTH_BASE_URL?.trim()) || MP_AUTH_BASE),
  };
}

export function mercadoPagoAuthorizeUrl(config: MercadoPagoConfig, state: string): string {
  const url = new URL(`${config.authBase}/authorization`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", config.redirectUri);
  return url.toString();
}

async function request(fetchImpl: MpFetch, url: string, init: RequestInit, code: string): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch {
    throw new MercadoPagoError(`${code}_network`);
  }
  if (!response.ok) throw new MercadoPagoError(code, response.status);
  try {
    const body: unknown = await response.json();
    if (!body || typeof body !== "object") throw new Error("invalid");
    return body as Record<string, unknown>;
  } catch {
    throw new MercadoPagoError(`${code}_invalid_response`, response.status);
  }
}

function tokensFrom(body: Record<string, unknown>): MercadoPagoTokens {
  const { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn, user_id: userId } = body;
  if (typeof accessToken !== "string" || !accessToken || typeof refreshToken !== "string" || !refreshToken || typeof expiresIn !== "number" || !(expiresIn > 0) || (typeof userId !== "number" && typeof userId !== "string")) {
    throw new MercadoPagoError("oauth_invalid_response");
  }
  return { accessToken, refreshToken, expiresInSeconds: expiresIn, mpUserId: String(userId) };
}

const jsonHeaders = { "Content-Type": "application/json", Accept: "application/json" };

export async function exchangeMercadoPagoCode(config: MercadoPagoConfig, code: string, fetchImpl: MpFetch = fetch): Promise<MercadoPagoTokens> {
  const body = await request(fetchImpl, `${config.apiBase}/oauth/token`, {
    method: "POST", headers: jsonHeaders,
    body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: "authorization_code", code, redirect_uri: config.redirectUri }),
  }, "oauth_exchange");
  return tokensFrom(body);
}

export async function refreshMercadoPagoToken(config: MercadoPagoConfig, refreshToken: string, fetchImpl: MpFetch = fetch): Promise<MercadoPagoTokens> {
  const body = await request(fetchImpl, `${config.apiBase}/oauth/token`, {
    method: "POST", headers: jsonHeaders,
    body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: "refresh_token", refresh_token: refreshToken }),
  }, "oauth_refresh");
  return tokensFrom(body);
}

/** Mercado Pago expects an explicit offset; Brazil (Brasília) has no daylight saving time. */
export function mercadoPagoDate(date: Date): string {
  return new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString().replace("Z", "-03:00");
}

const reais = (cents: number) => Math.round(cents) / 100;
const authHeaders = (accessToken: string) => ({ ...jsonHeaders, Authorization: `Bearer ${accessToken}` });
const paymentIdPattern = /^\d{1,20}$/;

/** Pix payment created with the SELLER token; `application_fee` goes to the EventMap (app owner) account. */
export async function createMercadoPagoPixPayment(apiBase: string, accessToken: string, input: PixPaymentInput, fetchImpl: MpFetch = fetch): Promise<PixPayment> {
  const body = await request(fetchImpl, `${apiBase}/v1/payments`, {
    method: "POST",
    headers: { ...authHeaders(accessToken), "X-Idempotency-Key": input.orderId },
    body: JSON.stringify({
      transaction_amount: reais(input.amountCents),
      application_fee: reais(input.feeCents),
      description: input.description.slice(0, 120),
      payment_method_id: "pix",
      external_reference: input.orderId,
      date_of_expiration: mercadoPagoDate(input.expiresAt),
      payer: { email: input.payerEmail },
      ...(input.notificationUrl ? { notification_url: input.notificationUrl } : {}),
    }),
  }, "payment_create");
  const data = (body.point_of_interaction as { transaction_data?: { qr_code?: unknown; qr_code_base64?: unknown } } | undefined)?.transaction_data;
  const id = body.id;
  if ((typeof id !== "number" && typeof id !== "string") || !paymentIdPattern.test(String(id)) || typeof data?.qr_code !== "string" || typeof data.qr_code_base64 !== "string") {
    throw new MercadoPagoError("payment_create_invalid_response");
  }
  return { paymentId: String(id), status: typeof body.status === "string" ? body.status : "pending", qrCode: data.qr_code, qrCodeBase64: data.qr_code_base64 };
}

export async function getMercadoPagoPayment(apiBase: string, accessToken: string, paymentId: string, fetchImpl: MpFetch = fetch): Promise<MercadoPagoPayment> {
  if (!paymentIdPattern.test(paymentId)) throw new MercadoPagoError("payment_invalid_id");
  const body = await request(fetchImpl, `${apiBase}/v1/payments/${paymentId}`, { method: "GET", headers: authHeaders(accessToken) }, "payment_get");
  const amount = body.transaction_amount;
  return {
    id: String(body.id ?? ""),
    status: typeof body.status === "string" ? body.status : "unknown",
    externalReference: typeof body.external_reference === "string" ? body.external_reference : null,
    amountCents: centsOf(amount),
    currencyId: typeof body.currency_id === "string" ? body.currency_id : null,
    applicationFeeCents: applicationFeeOf(body),
  };
}

function centsOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) : null;
}

function applicationFeeOf(body: Record<string, unknown>): number | null {
  const direct = centsOf(body.application_fee);
  if (direct !== null) return direct;
  if (!Array.isArray(body.fee_details)) return null;
  const fee = body.fee_details.find((item): item is { amount: unknown } => Boolean(item) && typeof item === "object" && (item as { type?: unknown }).type === "application_fee");
  return fee ? centsOf(fee.amount) : null;
}

/** Cancels a pending payment so its Pix can no longer be paid. */
export async function cancelMercadoPagoPayment(apiBase: string, accessToken: string, paymentId: string, fetchImpl: MpFetch = fetch): Promise<void> {
  if (!paymentIdPattern.test(paymentId)) throw new MercadoPagoError("payment_invalid_id");
  await request(fetchImpl, `${apiBase}/v1/payments/${paymentId}`, { method: "PUT", headers: authHeaders(accessToken), body: JSON.stringify({ status: "cancelled" }) }, "payment_cancel");
}

/** Full refund (the platform fee is returned too). */
export async function refundMercadoPagoPayment(apiBase: string, accessToken: string, paymentId: string, idempotencyKey: string, fetchImpl: MpFetch = fetch): Promise<void> {
  if (!paymentIdPattern.test(paymentId)) throw new MercadoPagoError("payment_invalid_id");
  await request(fetchImpl, `${apiBase}/v1/payments/${paymentId}/refunds`, {
    method: "POST", headers: { ...authHeaders(accessToken), "X-Idempotency-Key": idempotencyKey }, body: JSON.stringify({}),
  }, "payment_refund");
}
