import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { createNotification } from "@/lib/notifications/create";
import { notificationCopy } from "@/lib/notifications/catalog";
import type { ResolveAdminId, ResolveCurrentUser } from "@/lib/services/authContext";
import {
  TICKET_FEE_PERCENT, TICKET_ORDER_RATE_LIMIT, TICKET_ORDER_RATE_WINDOW_MS, TICKET_ORDER_TTL_MS,
  discountedTicketCents, isOpenTicketOrder, normalizeCouponCode, shortTicketCode, ticketEligibility, ticketFeeCents, ticketSeatsLeft, ticketSettingsError,
  type TicketBlockCode, type TicketOrderStatusValue,
} from "@/lib/tickets";
import { eventInstant } from "@/lib/eventTime";
import { TicketConfigError, decryptTicketToken, encryptTicketToken, signOAuthState, ticketPaymentsConfigured, verifyMercadoPagoSignature, verifyOAuthState } from "@/lib/ticketSecurity";
import {
  MercadoPagoError, cancelMercadoPagoPayment, createMercadoPagoPixPayment, exchangeMercadoPagoCode, getMercadoPagoPayment, mercadoPagoAuthorizeUrl, mercadoPagoConfig,
  refreshMercadoPagoToken, refundMercadoPagoPayment, type MercadoPagoConfig, type MercadoPagoPayment, type MercadoPagoTokens, type MpFetch, type PixPayment,
} from "@/lib/mercadopago";
import { connectCallbackSchema, createTicketCouponSchema, createTicketOrderSchema, ticketCouponPreviewSchema, ticketCouponToggleSchema, ticketOrderSchema } from "@/schemas/tickets";

type Env = Record<string, string | undefined>;
/** Everything external is injectable so the offline suite never touches the network or the real clock. */
export type TicketDeps = { fetch?: MpFetch; now?: () => Date; env?: Env; statusCheckIntervalMs?: number; reconcileIntervalMs?: number };
type Resolved = { fetch: MpFetch; now: () => Date; env: Env; statusCheckIntervalMs: number; reconcileIntervalMs: number };
const resolveDeps = (deps: TicketDeps = {}): Resolved => ({
  fetch: deps.fetch ?? ((input, init) => fetch(input, init)),
  now: deps.now ?? (() => new Date()),
  env: deps.env ?? process.env,
  statusCheckIntervalMs: deps.statusCheckIntervalMs ?? 10_000,
  reconcileIntervalMs: deps.reconcileIntervalMs ?? 5 * 60 * 1000,
});

export type TicketResult<T = undefined> = { success: true; message: string; data: T } | { success: false; message: string };
export type TicketOrderView = {
  id: string; code: string; eventId: string; eventName: string; status: TicketOrderStatusValue; unitCents: number;
  expiresAt: string; paidAt: string | null; pixCopyPaste: string | null; pixQrBase64: string | null;
};
export type TicketPurchaseState = {
  state: "available" | "login" | "pending" | "owned" | "sold_out" | "closed" | "own_event" | "unavailable";
  priceCents: number; seatsLeft: number | null; message: string | null; order: TicketOrderView | null;
};
export type SellerOrderView = { id: string; code: string; buyerName: string; status: TicketOrderStatusValue; unitCents: number; feeCents: number; paidAt: string | null; refundedAt: string | null };
export type SellerEventSales = { eventId: string; eventName: string; sold: number; refunded: number; grossCents: number; feeCents: number; netCents: number; orders: SellerOrderView[] };
export type PaymentsOverview = {
  configured: boolean; feePercent: number;
  account: { mpUserId: string; connectedAt: string; needsReconnect: boolean } | null;
  events: SellerEventSales[];
  totals: { sold: number; grossCents: number; feeCents: number; netCents: number };
};
export type MyTicketView = {
  id: string; code: string; status: TicketOrderStatusValue; unitCents: number; eventId: string; eventName: string; dataInicio: string; startTime: string | null; paidAt: string | null; createdAt: string;
  /** Refunds are requested from the organizer (seller), linked from /ingressos. */
  organizerId: string; organizerName: string;
};
export type AdminTicketOverview = {
  paid: { count: number; grossCents: number; feeCents: number };
  refunded: { count: number; grossCents: number };
  recent: (SellerOrderView & { eventId: string; eventName: string; sellerName: string })[];
};

const denied = { success: false as const, message: "Acesso negado." };
const loginRequired = { success: false as const, message: "Entre na sua conta para comprar ingressos." };
const notConfigured = "Os pagamentos ainda não foram configurados no EventMap.";
const genericError = { success: false as const, message: "Não foi possível concluir agora. Tente novamente em alguns minutos." };
const pixError = { success: false as const, message: "Não foi possível gerar o Pix agora. Tente novamente em alguns minutos." };
const iso = (value: Date | null | undefined) => (value ? new Date(value).toISOString() : null);
const REFRESH_BEFORE_MS = 7 * 24 * 60 * 60 * 1000;
const RECONCILE_WINDOW_MS = 24 * 60 * 60 * 1000;
const ATTEMPTS = 5;
/** expiresAt sentinel for an account whose refresh token was rejected (invalid_grant): only a new OAuth connection fixes it. */
const RECONNECT_MARK = new Date(0);
const sellerDisconnected = "A conta do Mercado Pago do organizador está desconectada. Reconecte a conta em Pagamentos para estornar; nada foi alterado.";
const refundProviderError = "O Mercado Pago não confirmou o estorno agora. Nada foi alterado; tente novamente em alguns minutos.";

function isRetryable(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2034") return true;
  // Postgres serialization failures (SQLSTATE 40001) can also surface as raw-query / transaction API errors.
  if (error.code !== "P2010" && error.code !== "P2028") return false;
  let detail = String(error.message ?? "");
  try { detail += JSON.stringify(error.meta ?? {}); } catch { /* meta is only a hint */ }
  return /\b40001\b/.test(detail);
}

const backoff = () => new Promise<void>((resolve) => setTimeout(resolve, 25 + Math.floor(Math.random() * 126)));

/** Serializable transaction with jittered retries on serialization conflicts (two buyers racing for the last seat). */
async function serializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!isRetryable(error) || attempt >= ATTEMPTS) throw error;
      await backoff();
    }
  }
}

/** True when the stored tokens can no longer be used (refresh rejected, or expired without a successful refresh). */
function accountNeedsReconnect(expiresAt: Date, now: Date): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}

/** An event has ended once its end date/time passed (end of that day when no end time is set). */
function eventHasEnded(event: { dataInicio: string; dataFim: string; endTime: string | null; timezone: string | null }, now: Date): boolean {
  const day = (event.dataFim || event.dataInicio || "").slice(0, 10);
  const end = eventInstant(day, event.endTime || "23:59", event.timezone || "America/Sao_Paulo");
  return Boolean(end && end.getTime() <= now.getTime());
}

function configuration(d: Resolved): MercadoPagoConfig | null {
  return ticketPaymentsConfigured(d.env) ? mercadoPagoConfig(d.env) : null;
}

function siteOrigin(env: Env): string | null {
  try { return new URL(env.NEXTAUTH_URL || env.NEXT_PUBLIC_BASE_URL || "").origin; } catch { return null; }
}

/** Mercado Pago only calls public HTTPS URLs; local runs rely on the live status check. */
function notificationUrl(env: Env): string | null {
  const origin = siteOrigin(env);
  return origin?.startsWith("https://") ? `${origin}/api/webhooks/mercadopago` : null;
}

const orderSelect = {
  id: true, eventId: true, buyerId: true, sellerId: true, unitCents: true, feeCents: true, status: true, mpPaymentId: true,
  pixCopyPaste: true, pixQrBase64: true, expiresAt: true, paidAt: true, refundedAt: true, createdAt: true,
  event: { select: { nome: true } },
} satisfies Prisma.TicketOrderSelect;
type OrderRow = Prisma.TicketOrderGetPayload<{ select: typeof orderSelect }>;

function toView(row: OrderRow): TicketOrderView {
  const open = row.status === "PENDING";
  return {
    id: row.id, code: shortTicketCode(row.id), eventId: row.eventId, eventName: row.event.nome, status: row.status, unitCents: row.unitCents,
    expiresAt: new Date(row.expiresAt).toISOString(), paidAt: iso(row.paidAt),
    pixCopyPaste: open ? row.pixCopyPaste : null, pixQrBase64: open ? row.pixQrBase64 : null,
  };
}

const saleEventSelect = {
  id: true, nome: true, userId: true, status: true, dataInicio: true, startTime: true, timezone: true,
  ticketsEnabled: true, ticketCapacity: true, isFree: true, priceCents: true,
} satisfies Prisma.EventsSelect;

type Store = Pick<Prisma.TransactionClient, "ticketOrder">;
async function seatsTaken(db: Store, eventId: string, now: Date): Promise<number> {
  const [paid, pending] = await Promise.all([
    db.ticketOrder.count({ where: { eventId, status: "PAID" } }),
    db.ticketOrder.count({ where: { eventId, status: "PENDING", expiresAt: { gt: now } } }),
  ]);
  return paid + pending;
}

/** Google verifies the address it hands over, so Google accounts count as verified (their emailVerified stays null). */
async function buyerProfile(db: Pick<Prisma.TransactionClient, "user">, userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, emailVerified: true, accounts: { where: { provider: "google" }, select: { id: true }, take: 1 } },
  });
  return user ? { email: user.email, verified: user.emailVerified === true || user.accounts.length > 0 } : null;
}

/** Connected = tokens stored and not flagged for reconnection after a rejected refresh. */
async function sellerConnected(db: Pick<Prisma.TransactionClient, "mercadoPagoAccount">, sellerId: string | null): Promise<boolean> {
  if (!sellerId) return false;
  const account = await db.mercadoPagoAccount.findUnique({ where: { userId: sellerId }, select: { expiresAt: true } });
  return Boolean(account && new Date(account.expiresAt).getTime() > RECONNECT_MARK.getTime());
}

/** A sealed token that no longer opens means the encryption key changed: a configuration problem, not a provider one. */
function openToken(sealed: string, env: Env): string {
  try {
    return decryptTicketToken(sealed, env);
  } catch (error) {
    if (error instanceof TicketConfigError) throw error;
    throw new TicketConfigError("ticket-token-unreadable");
  }
}

const accountSelect = { accessTokenEnc: true, refreshTokenEnc: true, expiresAt: true } satisfies Prisma.MercadoPagoAccountSelect;

/** Flags the account once (refresh token rejected) and tells the seller to reconnect. Never throws. */
async function markNeedsReconnect(sellerId: string, refreshTokenEnc: string, now: Date): Promise<void> {
  try {
    const marked = await prisma.mercadoPagoAccount.updateMany({
      where: { userId: sellerId, refreshTokenEnc, expiresAt: { gt: RECONNECT_MARK } },
      data: { expiresAt: RECONNECT_MARK, updatedAt: now },
    });
    if (!marked.count) return;
    await createNotification(prisma, notificationCopy({
      userId: sellerId, type: "SYSTEM" as const, href: "/myEvents/pagamentos", groupKey: `mp-reconnect:${sellerId}`,
      title: "Reconecte sua conta do Mercado Pago",
      message: "O Mercado Pago encerrou a autorização do EventMap. Reconecte em Pagamentos para continuar vendendo e estornando ingressos.",
    }));
  } catch {
    console.warn("ticket-reconnect-mark-failed");
  }
}

/** Seller access token, refreshed when it expires within a week. Never leaves the server. */
async function sellerAccessToken(sellerId: string, config: MercadoPagoConfig, d: Resolved): Promise<string> {
  const account = await prisma.mercadoPagoAccount.findUnique({ where: { userId: sellerId }, select: accountSelect });
  if (!account) throw new Error("SELLER_NOT_CONNECTED");
  const now = d.now();
  const expiresAt = new Date(account.expiresAt).getTime();
  if (expiresAt <= RECONNECT_MARK.getTime()) throw new Error("SELLER_TOKEN_EXPIRED");
  if (expiresAt - now.getTime() > REFRESH_BEFORE_MS) return openToken(account.accessTokenEnc, d.env);
  let tokens: MercadoPagoTokens;
  try {
    tokens = await refreshMercadoPagoToken(config, openToken(account.refreshTokenEnc, d.env), d.fetch);
  } catch (error) {
    if (error instanceof TicketConfigError) throw error;
    if (error instanceof MercadoPagoError && error.code === "oauth_refresh" && (error.status === 400 || error.status === 401)) {
      // invalid_grant: the seller revoked the app or the refresh token is gone. Retrying cannot help.
      console.warn("ticket-token-refresh-rejected");
      await markNeedsReconnect(sellerId, account.refreshTokenEnc, now);
      throw new Error("SELLER_TOKEN_EXPIRED");
    }
    console.warn("ticket-token-refresh-failed");
    if (expiresAt > now.getTime()) return openToken(account.accessTokenEnc, d.env);
    throw new Error("SELLER_TOKEN_EXPIRED");
  }
  // Conditional on the refresh token just used: if a concurrent request rotated it first, its stored tokens win.
  const stored = await prisma.mercadoPagoAccount.updateMany({
    where: { userId: sellerId, refreshTokenEnc: account.refreshTokenEnc },
    data: {
      accessTokenEnc: encryptTicketToken(tokens.accessToken, d.env), refreshTokenEnc: encryptTicketToken(tokens.refreshToken, d.env),
      expiresAt: new Date(now.getTime() + tokens.expiresInSeconds * 1000), mpUserId: tokens.mpUserId, updatedAt: now,
    },
  });
  if (stored.count) return tokens.accessToken;
  const fresh = await prisma.mercadoPagoAccount.findUnique({ where: { userId: sellerId }, select: accountSelect });
  if (!fresh) throw new Error("SELLER_NOT_CONNECTED");
  if (accountNeedsReconnect(fresh.expiresAt, now)) throw new Error("SELLER_TOKEN_EXPIRED");
  return openToken(fresh.accessTokenEnc, d.env);
}

const isDisconnectedError = (error: unknown) => error instanceof Error && (error.message === "SELLER_NOT_CONNECTED" || error.message === "SELLER_TOKEN_EXPIRED");

// ---------- Connect / disconnect ----------

export async function getTicketSellerStatus(resolveCurrentUser: ResolveCurrentUser, deps?: TicketDeps): Promise<TicketResult<{ configured: boolean; connected: boolean }>> {
  const d = resolveDeps(deps);
  const user = await resolveCurrentUser();
  if (!user) return denied;
  const configured = ticketPaymentsConfigured(d.env);
  try {
    return { success: true, message: "", data: { configured, connected: configured && await sellerConnected(prisma, user.id) } };
  } catch {
    console.warn("ticket-seller-status-failed");
    return genericError;
  }
}

export async function startMercadoPagoConnect(resolveAccountHolder: ResolveCurrentUser, deps?: TicketDeps): Promise<TicketResult<{ url: string }>> {
  const d = resolveDeps(deps);
  const user = await resolveAccountHolder();
  if (!user || (user.role !== "PROMOTER" && user.role !== "ADMIN")) return denied;
  const config = configuration(d);
  if (!config) return { success: false, message: notConfigured };
  try {
    return { success: true, message: "", data: { url: mercadoPagoAuthorizeUrl(config, signOAuthState(user.id, d.env, d.now())) } };
  } catch {
    console.warn("ticket-connect-start-failed");
    return genericError;
  }
}

export type ConnectOutcome = "connected" | "denied" | "invalid" | "error" | "unavailable" | "account_mismatch";

/** OAuth callback: the state must be signed for the signed-in account holder; the code is exchanged on the server. */
export async function completeMercadoPagoConnect(params: unknown, resolveAccountHolder: ResolveCurrentUser, deps?: TicketDeps): Promise<ConnectOutcome> {
  const d = resolveDeps(deps);
  const config = configuration(d);
  if (!config) return "unavailable";
  const parsed = connectCallbackSchema.safeParse(params);
  if (!parsed.success) return "invalid";
  const user = await resolveAccountHolder();
  if (!user || (user.role !== "PROMOTER" && user.role !== "ADMIN")) return "invalid";
  if (!verifyOAuthState(parsed.data.state, user.id, d.env, d.now())) return "invalid";
  if (parsed.data.error) return "denied";
  if (!parsed.data.code) return "invalid";
  try {
    const tokens = await exchangeMercadoPagoCode(config, parsed.data.code, d.fetch);
    // Open and paid orders are confirmed and refunded with the connected account: switching accounts would strand them.
    const existing = await prisma.mercadoPagoAccount.findUnique({ where: { userId: user.id }, select: { mpUserId: true } });
    if (existing && existing.mpUserId !== tokens.mpUserId) {
      const active = await prisma.ticketOrder.count({ where: { sellerId: user.id, status: { in: ["PENDING", "PAID"] } } });
      if (active) return "account_mismatch";
    }
    const now = d.now();
    const sealed = {
      mpUserId: tokens.mpUserId, accessTokenEnc: encryptTicketToken(tokens.accessToken, d.env), refreshTokenEnc: encryptTicketToken(tokens.refreshToken, d.env),
      expiresAt: new Date(now.getTime() + tokens.expiresInSeconds * 1000),
    };
    await prisma.mercadoPagoAccount.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...sealed, connectedAt: now },
      update: { ...sealed, connectedAt: now, updatedAt: now },
    });
    return "connected";
  } catch {
    console.warn("ticket-connect-failed");
    return "error";
  }
}

export async function disconnectMercadoPago(resolveAccountHolder: ResolveCurrentUser, deps?: TicketDeps): Promise<TicketResult> {
  const d = resolveDeps(deps);
  const user = await resolveAccountHolder();
  if (!user) return denied;
  try {
    const now = d.now();
    // Open Pix payments are confirmed with this account's token, so they must finish (or expire) first.
    const open = await prisma.ticketOrder.count({ where: { sellerId: user.id, status: "PENDING", expiresAt: { gt: now } } });
    if (open) return { success: false, message: `Há ${open} ${open === 1 ? "Pix em andamento" : "Pix em andamento"}. Tente desconectar em até 30 minutos, quando ${open === 1 ? "ele terminar" : "eles terminarem"}.` };
    // Paid tickets for upcoming events may still need a refund, which only this account can do.
    const paid = await prisma.ticketOrder.findMany({
      where: { sellerId: user.id, status: "PAID" }, take: 2000,
      select: { event: { select: { dataInicio: true, dataFim: true, endTime: true, timezone: true } } },
    });
    const upcoming = paid.filter((order) => !eventHasEnded(order.event, now)).length;
    if (upcoming) return { success: false, message: `Há ${upcoming} ${upcoming === 1 ? "ingresso pago" : "ingressos pagos"} para eventos que ainda não terminaram. Mantenha a conta conectada até o fim desses eventos para poder estornar se for preciso.` };
    await prisma.$transaction(async (tx) => {
      await tx.mercadoPagoAccount.deleteMany({ where: { userId: user.id } });
      await tx.events.updateMany({ where: { userId: user.id, ticketsEnabled: true }, data: { ticketsEnabled: false } });
    });
    return { success: true, message: "Mercado Pago desconectado. As vendas pelo EventMap foram pausadas nos seus eventos.", data: undefined };
  } catch {
    console.warn("ticket-disconnect-failed");
    return genericError;
  }
}

/** Used by the event form action: enabling sales needs a paid price in bounds and the owner's connected account. */
export async function ticketSettingsProblem(
  db: Pick<Prisma.TransactionClient, "mercadoPagoAccount">, sellerId: string,
  settings: { ticketsEnabled: boolean; isFree: boolean; priceCents: number }, env: Env = process.env,
): Promise<string | null> {
  if (!settings.ticketsEnabled) return null;
  const configured = ticketPaymentsConfigured(env);
  return ticketSettingsError({ ...settings, configured, sellerConnected: configured && await sellerConnected(db, sellerId) });
}

/** Whether the public page should show the EventMap checkout instead of the free registration. */
export async function isTicketSaleActive(eventId: string, deps?: TicketDeps): Promise<boolean> {
  const d = resolveDeps(deps);
  if (!ticketPaymentsConfigured(d.env)) return false;
  try {
    const event = await prisma.events.findUnique({ where: { id: eventId }, select: { ticketsEnabled: true, isFree: true } });
    return Boolean(event?.ticketsEnabled && !event.isFree);
  } catch {
    return false;
  }
}

// ---------- Buying ----------

const stateFor: Partial<Record<TicketBlockCode, TicketPurchaseState["state"]>> = {
  not_published: "closed", ended: "closed", own_event: "own_event",
};

export async function getTicketPurchaseState(eventId: string, resolveViewer: ResolveCurrentUser, deps?: TicketDeps): Promise<TicketResult<TicketPurchaseState>> {
  const d = resolveDeps(deps);
  if (typeof eventId !== "string" || !eventId || eventId.length > 64) return { success: false, message: "Evento não encontrado." };
  try {
    const event = await prisma.events.findUnique({ where: { id: eventId }, select: saleEventSelect });
    if (!event) return { success: false, message: "Evento não encontrado." };
    const base = { priceCents: event.priceCents, seatsLeft: null, order: null };
    if (!ticketPaymentsConfigured(d.env)) return { success: true, message: "", data: { ...base, state: "unavailable", message: "Pagamentos ainda não configurados." } };
    const viewer = await resolveViewer();
    const now = d.now();
    const buyer = viewer ? await buyerProfile(prisma, viewer.id) : null;
    const blocked = ticketEligibility({ event, buyerId: viewer?.id ?? null, sellerConnected: await sellerConnected(prisma, event.userId), buyerEmailVerified: buyer?.verified ?? false, now });
    const taken = await seatsTaken(prisma, event.id, now);
    const seatsLeft = ticketSeatsLeft(event.ticketCapacity, taken);
    if (viewer) {
      const own = await prisma.ticketOrder.findFirst({ where: { eventId: event.id, buyerId: viewer.id, status: { in: ["PAID", "PENDING"] } }, orderBy: { createdAt: "desc" }, select: orderSelect });
      if (own?.status === "PAID") return { success: true, message: "", data: { ...base, seatsLeft, state: "owned", message: null, order: toView(own) } };
      if (own && isOpenTicketOrder(own, now)) return { success: true, message: "", data: { ...base, seatsLeft, state: "pending", message: null, order: toView(own) } };
    }
    if (blocked && blocked.code !== "email_unverified") return { success: true, message: "", data: { ...base, seatsLeft, state: stateFor[blocked.code] ?? "unavailable", message: blocked.message } };
    if (seatsLeft === 0) return { success: true, message: "", data: { ...base, seatsLeft, state: "sold_out", message: "Ingressos esgotados." } };
    // Unverified e-mail: the button stays visible and the purchase explains what to do.
    return { success: true, message: "", data: { ...base, seatsLeft, state: viewer ? "available" : "login", message: blocked?.message ?? null } };
  } catch {
    console.warn("ticket-state-failed");
    return genericError;
  }
}

type CreateOutcome =
  | { kind: "blocked"; message: string }
  | { kind: "existing"; order: OrderRow }
  | { kind: "created"; order: OrderRow; payerEmail: string; eventName: string };

export async function createTicketOrder(rawInput: unknown, resolveAccountHolder: ResolveCurrentUser, deps?: TicketDeps): Promise<TicketResult<TicketOrderView>> {
  const d = resolveDeps(deps);
  const user = await resolveAccountHolder();
  if (!user) return loginRequired;
  const parsed = createTicketOrderSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, message: "Evento inválido." };
  const config = configuration(d);
  if (!config) return { success: false, message: notConfigured };
  let outcome: CreateOutcome;
  try {
    outcome = await serializable(async (tx): Promise<CreateOutcome> => {
      const now = d.now();
      const event = await tx.events.findUnique({ where: { id: parsed.data.eventId }, select: saleEventSelect });
      if (!event) return { kind: "blocked", message: "Evento não encontrado." };
      await tx.ticketOrder.updateMany({ where: { eventId: event.id, status: "PENDING", expiresAt: { lte: now } }, data: { status: "EXPIRED" } });
      const existing = await tx.ticketOrder.findFirst({ where: { eventId: event.id, buyerId: user.id, status: { in: ["PAID", "PENDING"] } }, select: orderSelect });
      if (existing?.status === "PAID") return { kind: "blocked", message: "Você já tem ingresso para este evento. Confira em Meus ingressos." };
      if (existing) return { kind: "existing", order: existing };
      const buyer = await buyerProfile(tx, user.id);
      const blocked = ticketEligibility({ event, buyerId: user.id, sellerConnected: await sellerConnected(tx, event.userId), buyerEmailVerified: buyer?.verified ?? false, now });
      if (blocked) return { kind: "blocked", message: blocked.message };
      if (!buyer?.email) return { kind: "blocked", message: "Cadastre um e-mail na sua conta para receber o Pix." };
      const recent = await tx.ticketOrder.count({ where: { buyerId: user.id, createdAt: { gte: new Date(now.getTime() - TICKET_ORDER_RATE_WINDOW_MS) } } });
      if (recent >= TICKET_ORDER_RATE_LIMIT) return { kind: "blocked", message: "Muitas tentativas de compra em pouco tempo. Aguarde alguns minutos e tente novamente." };
      if (event.ticketCapacity != null && await seatsTaken(tx, event.id, now) >= event.ticketCapacity) return { kind: "blocked", message: "Ingressos esgotados." };
      let unitCents = event.priceCents;
      let coupon: { id: string; discountCents: number } | null = null;
      if (parsed.data.couponCode) {
        const applied = await resolveCoupon(tx, event.id, event.priceCents, parsed.data.couponCode, now);
        if (!applied.ok) return { kind: "blocked", message: applied.message };
        unitCents = applied.finalCents;
        coupon = { id: applied.couponId, discountCents: applied.discountCents };
      }
      const order = await tx.ticketOrder.create({
        data: {
          eventId: event.id, buyerId: user.id, sellerId: event.userId!, unitCents, feeCents: ticketFeeCents(unitCents),
          expiresAt: new Date(now.getTime() + TICKET_ORDER_TTL_MS),
          ...(coupon ? { couponId: coupon.id, discountCents: coupon.discountCents } : {}),
        },
        select: orderSelect,
      });
      return { kind: "created", order, payerEmail: buyer.email, eventName: event.nome };
    });
  } catch {
    console.warn("ticket-order-create-failed");
    return genericError;
  }
  if (outcome.kind === "blocked") return { success: false, message: outcome.message };
  if (outcome.kind === "existing") return { success: true, message: "Seu Pix continua válido. Conclua o pagamento antes que ele expire.", data: toView(outcome.order) };

  // The Mercado Pago call happens outside the transaction; the order id is the idempotency key.
  const order = outcome.order;
  const cancelOrder = async () => {
    try {
      await prisma.ticketOrder.updateMany({ where: { id: order.id, status: "PENDING" }, data: { status: "CANCELLED" } });
    } catch {
      console.warn("ticket-order-cancel-failed");
    }
  };
  let token: string;
  let pix: PixPayment;
  try {
    token = await sellerAccessToken(order.sellerId, config, d);
    pix = await createMercadoPagoPixPayment(config.apiBase, token, {
      orderId: order.id, amountCents: order.unitCents, feeCents: order.feeCents, description: `Ingresso: ${outcome.eventName}`,
      payerEmail: outcome.payerEmail, notificationUrl: notificationUrl(d.env), expiresAt: order.expiresAt,
    }, d.fetch);
  } catch {
    // No QR code was ever shown, so nothing can be paid for this order.
    console.warn("ticket-pix-create-failed");
    await cancelOrder();
    return pixError;
  }
  const pixData = { mpPaymentId: pix.paymentId, pixCopyPaste: pix.qrCode, pixQrBase64: pix.qrCodeBase64 };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await prisma.ticketOrder.updateMany({ where: { id: order.id, status: "PENDING" }, data: pixData });
      return { success: true, message: "Pix gerado. Pague em até 30 minutos.", data: toView({ ...order, ...pixData }) };
    } catch {
      console.warn("ticket-pix-store-failed");
    }
  }
  // The payment exists at Mercado Pago but could not be stored. Its QR code is never shown, and it is cancelled there
  // before the order is released; if that cancel fails too, the order stays PENDING (seat held) until it expires.
  try {
    await cancelMercadoPagoPayment(config.apiBase, token, pix.paymentId, d.fetch);
    await cancelOrder();
  } catch {
    console.warn("ticket-pix-cancel-failed");
  }
  return pixError;
}

// ---------- Discount coupons ----------

export type TicketCouponView = {
  id: string; code: string; percentOff: number | null; amountOffCents: number | null; maxUses: number | null;
  expiresAt: string | null; active: boolean; uses: number; createdAt: string;
};
export type TicketCouponPreview = { code: string; priceCents: number; discountCents: number; finalCents: number };
type CouponCheck = { ok: true; couponId: string; code: string; discountCents: number; finalCents: number } | { ok: false; message: string };
const couponInvalid = "Cupom inválido para este evento.";
const couponSelect = { id: true, eventId: true, code: true, percentOff: true, amountOffCents: true, maxUses: true, expiresAt: true, active: true, createdAt: true } satisfies Prisma.TicketCouponSelect;

/** Uses held by a coupon: paid orders plus Pix still open. An unpaid Pix that expired gives its use back. */
function couponUses(db: Prisma.TransactionClient | typeof prisma, couponId: string, now: Date): Promise<number> {
  return db.ticketOrder.count({ where: { couponId, OR: [{ status: "PAID" }, { status: "PENDING", expiresAt: { gt: now } }] } });
}

async function resolveCoupon(db: Prisma.TransactionClient | typeof prisma, eventId: string, priceCents: number, rawCode: string, now: Date): Promise<CouponCheck> {
  const code = normalizeCouponCode(rawCode);
  if (!code) return { ok: false, message: couponInvalid };
  const coupon = await db.ticketCoupon.findUnique({ where: { eventId_code: { eventId, code } }, select: couponSelect });
  if (!coupon || !coupon.active) return { ok: false, message: couponInvalid };
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() <= now.getTime()) return { ok: false, message: "Este cupom expirou." };
  if (coupon.maxUses != null && await couponUses(db, coupon.id, now) >= coupon.maxUses) return { ok: false, message: "Este cupom já atingiu o limite de usos." };
  const finalCents = discountedTicketCents(priceCents, coupon);
  return { ok: true, couponId: coupon.id, code, discountCents: priceCents - finalCents, finalCents };
}

/** Event owned by the user (coupon management is the organizer's, not an admin's). */
async function ownedTicketEvent(eventId: string, userId: string) {
  const event = await prisma.events.findUnique({ where: { id: eventId }, select: { id: true, userId: true, priceCents: true } });
  return event && event.userId === userId ? event : null;
}

function couponView(row: Prisma.TicketCouponGetPayload<{ select: typeof couponSelect }>, uses: number): TicketCouponView {
  return {
    id: row.id, code: row.code, percentOff: row.percentOff, amountOffCents: row.amountOffCents, maxUses: row.maxUses,
    expiresAt: iso(row.expiresAt), active: row.active, uses, createdAt: new Date(row.createdAt).toISOString(),
  };
}

export async function createTicketCoupon(rawInput: unknown, resolveAccountHolder: ResolveCurrentUser, deps?: TicketDeps): Promise<TicketResult<TicketCouponView>> {
  const d = resolveDeps(deps);
  const user = await resolveAccountHolder();
  if (!user) return denied;
  const parsed = createTicketCouponSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, message: "Confira o cupom: desconto de 1% a 90% ou valor a partir de R$ 1,00." };
  const input = parsed.data;
  const code = normalizeCouponCode(input.code);
  if (!code) return { success: false, message: "Use de 3 a 20 letras, números, - ou _ no código do cupom." };
  if ((input.percentOff == null) === (input.amountOffCents == null)) return { success: false, message: "Escolha um desconto em porcentagem ou em valor." };
  if (input.expiresAt && new Date(input.expiresAt).getTime() <= d.now().getTime()) return { success: false, message: "A validade do cupom precisa ser no futuro." };
  try {
    const event = await ownedTicketEvent(input.eventId, user.id);
    if (!event) return denied;
    const duplicate = await prisma.ticketCoupon.findUnique({ where: { eventId_code: { eventId: event.id, code } }, select: { id: true } });
    if (duplicate) return { success: false, message: "Já existe um cupom com esse código neste evento." };
    const row = await prisma.ticketCoupon.create({
      data: {
        eventId: event.id, code, percentOff: input.percentOff ?? null, amountOffCents: input.amountOffCents ?? null,
        maxUses: input.maxUses ?? null, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
      select: couponSelect,
    });
    return { success: true, message: "Cupom criado.", data: couponView(row, 0) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { success: false, message: "Já existe um cupom com esse código neste evento." };
    console.warn("ticket-coupon-create-failed");
    return genericError;
  }
}

export async function listTicketCoupons(eventId: string, resolveViewer: ResolveCurrentUser, deps?: TicketDeps): Promise<TicketResult<TicketCouponView[]>> {
  const d = resolveDeps(deps);
  const user = await resolveViewer();
  if (!user || typeof eventId !== "string" || !eventId) return denied;
  try {
    const event = await ownedTicketEvent(eventId, user.id);
    if (!event) return denied;
    const rows = await prisma.ticketCoupon.findMany({ where: { eventId: event.id }, orderBy: { createdAt: "desc" }, take: 100, select: couponSelect });
    const now = d.now();
    const data = await Promise.all(rows.map(async (row) => couponView(row, await couponUses(prisma, row.id, now))));
    return { success: true, message: "", data };
  } catch {
    console.warn("ticket-coupon-list-failed");
    return genericError;
  }
}

export async function setTicketCouponActive(rawInput: unknown, resolveAccountHolder: ResolveCurrentUser): Promise<TicketResult> {
  const user = await resolveAccountHolder();
  if (!user) return denied;
  const parsed = ticketCouponToggleSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, message: "Cupom não encontrado." };
  try {
    const coupon = await prisma.ticketCoupon.findUnique({ where: { id: parsed.data.couponId }, select: { id: true, eventId: true } });
    if (!coupon || !await ownedTicketEvent(coupon.eventId, user.id)) return denied;
    await prisma.ticketCoupon.update({ where: { id: coupon.id }, data: { active: parsed.data.active } });
    return { success: true, message: parsed.data.active ? "Cupom reativado." : "Cupom desativado.", data: undefined };
  } catch {
    console.warn("ticket-coupon-toggle-failed");
    return genericError;
  }
}

/** Shows the discounted price before the Pix is generated. Reserves nothing; the checkout checks the coupon again. */
export async function previewTicketCoupon(rawInput: unknown, resolveViewer: ResolveCurrentUser, deps?: TicketDeps): Promise<TicketResult<TicketCouponPreview>> {
  const d = resolveDeps(deps);
  const user = await resolveViewer();
  if (!user) return loginRequired;
  const parsed = ticketCouponPreviewSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, message: couponInvalid };
  try {
    const event = await prisma.events.findUnique({ where: { id: parsed.data.eventId }, select: { id: true, priceCents: true, ticketsEnabled: true, isFree: true } });
    if (!event || !event.ticketsEnabled || event.isFree) return { success: false, message: couponInvalid };
    const applied = await resolveCoupon(prisma, event.id, event.priceCents, parsed.data.code, d.now());
    if (!applied.ok) return { success: false, message: applied.message };
    return { success: true, message: "Cupom aplicado.", data: { code: applied.code, priceCents: event.priceCents, discountCents: applied.discountCents, finalCents: applied.finalCents } };
  } catch {
    console.warn("ticket-coupon-preview-failed");
    return genericError;
  }
}

// ---------- Confirmation (webhook + live check) ----------

type SyncOrder = {
  id: string; eventId: string; buyerId: string; sellerId: string; status: TicketOrderStatusValue; unitCents: number; feeCents: number;
  mpPaymentId: string | null; event: { nome: string };
};
/** What a sync may need besides the payment: the seller token (late-approval refund) and the clock. */
type SyncContext = { config: MercadoPagoConfig; token: string; d: Resolved };

/** Confirmed ticket: registration (re)activated, buyer notified. Runs in the transaction that marked the order PAID. */
async function grantTicket(tx: Prisma.TransactionClient, order: SyncOrder): Promise<void> {
  const registration = await tx.eventRegistration.findUnique({ where: { eventId_userId: { eventId: order.eventId, userId: order.buyerId } }, select: { id: true, status: true } });
  if (!registration) await tx.eventRegistration.create({ data: { eventId: order.eventId, userId: order.buyerId, status: "CONFIRMED" } });
  else if (registration.status === "CANCELLED" || registration.status === "WAITLISTED") {
    await tx.eventRegistration.update({ where: { id: registration.id }, data: { status: "CONFIRMED", ...(registration.status === "CANCELLED" ? { qrVersion: { increment: 1 }, checkedInAt: null } : {}) } });
  }
  await createNotification(tx, notificationCopy({
    userId: order.buyerId, type: "CHECKIN" as const, href: `/eventos/${encodeURIComponent(order.eventId)}`, groupKey: `ticket-paid:${order.id}`,
    title: "Ingresso confirmado", message: `${order.event.nome}: pagamento recebido. Mostre o QR Code do seu ingresso na entrada.`,
  }));
  await tx.communitySignal.create({ data: { room: `user:${order.buyerId}` } });
}

/** Mercado Pago's payment must match the stored order exactly; anything else is ignored (logged with a fixed code). */
function paymentMatchesOrder(order: SyncOrder, payment: MercadoPagoPayment): boolean {
  if (payment.externalReference !== order.id || payment.amountCents !== order.unitCents || payment.currencyId !== "BRL"
    || (order.mpPaymentId !== null && payment.id !== order.mpPaymentId)) {
    console.warn("ticket-payment-mismatch");
    return false;
  }
  if (payment.applicationFeeCents === null) {
    console.warn("ticket-payment-fee-absent");
    return true;
  }
  if (payment.applicationFeeCents !== order.feeCents) {
    console.warn("ticket-payment-fee-mismatch");
    return false;
  }
  return true;
}

/**
 * Applies Mercado Pago's view of a payment to an order. Idempotent: status-guarded updates mean repeated webhooks
 * or concurrent live checks change the order (and create the registration) at most once.
 */
async function syncOrderWithPayment(order: SyncOrder, payment: MercadoPagoPayment, ctx: SyncContext): Promise<void> {
  if (!paymentMatchesOrder(order, payment)) return;
  const now = ctx.d.now();
  if (payment.status === "approved") {
    const outcome = await serializable(async (tx): Promise<"none" | "paid" | "oversold"> => {
      const current = await tx.ticketOrder.findUnique({ where: { id: order.id }, select: { status: true, event: { select: { ticketCapacity: true } } } });
      // EXPIRED is accepted too: a Pix approved at the deadline was paid and is honored while a seat is left.
      if (!current || (current.status !== "PENDING" && current.status !== "EXPIRED")) return "none";
      const capacity = current.event.ticketCapacity;
      const oversold = current.status === "EXPIRED" && capacity != null && await seatsTaken(tx, order.eventId, now) >= capacity;
      const changed = await tx.ticketOrder.updateMany({ where: { id: order.id, status: current.status }, data: { status: "PAID", paidAt: now } });
      if (!changed.count) return "none";
      // Sold out meanwhile: the money is recorded (PAID) and refunded right after, outside this transaction.
      if (oversold) return "oversold";
      await grantTicket(tx, order);
      return "paid";
    });
    if (outcome === "oversold") await refundLateApproval(order, payment.id, ctx);
    return;
  }
  if ((payment.status === "cancelled" || payment.status === "rejected") && order.status === "PENDING") {
    await prisma.ticketOrder.updateMany({ where: { id: order.id, status: "PENDING" }, data: { status: "CANCELLED" } });
    return;
  }
  if ((payment.status === "refunded" || payment.status === "charged_back") && order.status === "PAID") {
    await markRefunded(order, now);
  }
}

/** Late approval with no seat left: refund the Pix. If Mercado Pago refuses, the ticket is honored above capacity. */
async function refundLateApproval(order: SyncOrder, paymentId: string, ctx: SyncContext): Promise<void> {
  try {
    await refundMercadoPagoPayment(ctx.config.apiBase, ctx.token, paymentId, `refund-${order.id}`, ctx.d.fetch);
  } catch {
    console.warn("ticket-oversell-refund-failed");
    await serializable((tx) => grantTicket(tx, order));
    return;
  }
  await markRefunded(order, ctx.d.now(), "sold_out");
}

async function markRefunded(order: SyncOrder, now: Date, reason: "refund" | "sold_out" = "refund"): Promise<boolean> {
  return serializable(async (tx) => {
    const changed = await tx.ticketOrder.updateMany({ where: { id: order.id, status: "PAID" }, data: { status: "REFUNDED", refundedAt: now } });
    if (!changed.count) return false;
    // A ticket already used at the door keeps its check-in record.
    await tx.eventRegistration.updateMany({ where: { eventId: order.eventId, userId: order.buyerId, status: { in: ["CONFIRMED", "WAITLISTED"] } }, data: { status: "CANCELLED", qrVersion: { increment: 1 } } });
    const buyerNotice = reason === "sold_out"
      ? { title: "Ingressos esgotados", message: `${order.event.nome}: os ingressos esgotaram antes da confirmação; seu Pix foi devolvido.` }
      : { title: "Ingresso estornado", message: `${order.event.nome}: o valor do ingresso foi devolvido pelo Mercado Pago.` };
    await createNotification(tx, notificationCopy({ userId: order.buyerId, type: "SYSTEM" as const, href: "/ingressos", groupKey: `ticket-refund:${order.id}`, ...buyerNotice }));
    if (reason === "sold_out") {
      await createNotification(tx, notificationCopy({
        userId: order.sellerId, type: "SYSTEM" as const, href: "/myEvents/pagamentos", groupKey: `ticket-oversell:${order.id}`,
        title: "Pix devolvido automaticamente", message: `${order.event.nome}: um Pix aprovado depois do prazo chegou com os ingressos esgotados e foi devolvido.`,
      }));
    }
    await tx.communitySignal.create({ data: { room: `user:${order.buyerId}` } });
    return true;
  });
}

const lastLiveCheck = new Map<string, number>();

export async function getTicketOrderStatus(rawInput: unknown, resolveViewer: ResolveCurrentUser, deps?: TicketDeps): Promise<TicketResult<TicketOrderView>> {
  const d = resolveDeps(deps);
  const user = await resolveViewer();
  if (!user) return denied;
  const parsed = ticketOrderSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, message: "Pedido não encontrado." };
  try {
    let order = await prisma.ticketOrder.findFirst({ where: { id: parsed.data.orderId, buyerId: user.id }, select: orderSelect });
    if (!order) return { success: false, message: "Pedido não encontrado." };
    const config = configuration(d);
    const nowMs = d.now().getTime();
    // Live check (throttled) so a missed webhook never leaves a paid buyer waiting.
    if (order.status === "PENDING" && order.mpPaymentId && config && nowMs - (lastLiveCheck.get(order.id) ?? 0) >= d.statusCheckIntervalMs) {
      lastLiveCheck.set(order.id, nowMs);
      if (lastLiveCheck.size > 5000) lastLiveCheck.clear();
      try {
        const token = await sellerAccessToken(order.sellerId, config, d);
        await syncOrderWithPayment(order, await getMercadoPagoPayment(config.apiBase, token, order.mpPaymentId, d.fetch), { config, token, d });
      } catch {
        console.warn("ticket-live-check-failed");
      }
      order = await prisma.ticketOrder.findFirst({ where: { id: order.id }, select: orderSelect }) ?? order;
    }
    if (order.status === "PENDING" && new Date(order.expiresAt).getTime() <= d.now().getTime()) {
      await prisma.ticketOrder.updateMany({ where: { id: order.id, status: "PENDING" }, data: { status: "EXPIRED" } });
      order = { ...order, status: "EXPIRED" };
    }
    return { success: true, message: "", data: toView(order) };
  } catch {
    console.warn("ticket-status-failed");
    return genericError;
  }
}

/** `mpUserId` is the notification's `user_id` (the collector). It is unsigned and only picks which seller token to try. */
export type WebhookInput = { xSignature: string | null; xRequestId: string | null; dataId: string | null; type: string | null; mpUserId?: string | null };

/**
 * Mercado Pago webhook. The body is never trusted: the signature is checked, then the payment is read from the API
 * with the seller token and matched against the stored order. Returns the HTTP status to answer with:
 * 503 while payments are not configured (Mercado Pago keeps retrying), 400 for a bad signature, 500 on transient failures.
 */
export async function handleMercadoPagoWebhook(input: WebhookInput, deps?: TicketDeps): Promise<number> {
  const d = resolveDeps(deps);
  const config = configuration(d);
  if (!config) {
    console.warn("ticket-webhook-unconfigured");
    return 503;
  }
  if (!verifyMercadoPagoSignature({ xSignature: input.xSignature, xRequestId: input.xRequestId, dataId: input.dataId, secret: d.env.MP_WEBHOOK_SECRET, now: d.now() })) return 400;
  if (input.type !== "payment") return 200;
  if (!input.dataId || !/^\d{1,20}$/.test(input.dataId)) return 400;
  try {
    const order = await prisma.ticketOrder.findUnique({ where: { mpPaymentId: input.dataId }, select: orderSelect });
    if (!order) {
      await adoptUnknownPayment(input.dataId, input.mpUserId ?? null, config, d);
      return 200;
    }
    const token = await sellerAccessToken(order.sellerId, config, d);
    const payment = await getMercadoPagoPayment(config.apiBase, token, input.dataId, d.fetch);
    await syncOrderWithPayment(order, payment, { config, token, d });
    return 200;
  } catch (error) {
    if (error instanceof TicketConfigError) {
      console.warn("ticket-webhook-config-failed");
      return 503;
    }
    // Transient failure (database or Mercado Pago): a non-2xx answer makes Mercado Pago retry later.
    console.warn("ticket-webhook-failed");
    return 500;
  }
}

/**
 * A payment id never stored (the write after creating the Pix failed): read it with the collector's token and, when its
 * external_reference is one of that seller's orders still without a payment id, attach it and sync.
 */
async function adoptUnknownPayment(paymentId: string, mpUserId: string | null, config: MercadoPagoConfig, d: Resolved): Promise<void> {
  if (!mpUserId || !/^\d{1,20}$/.test(mpUserId)) return;
  const account = await prisma.mercadoPagoAccount.findFirst({ where: { mpUserId }, select: { userId: true } });
  if (!account) return;
  const token = await sellerAccessToken(account.userId, config, d);
  const payment = await getMercadoPagoPayment(config.apiBase, token, paymentId, d.fetch);
  if (payment.id !== paymentId || !payment.externalReference || payment.externalReference.length > 64) return;
  const order = await prisma.ticketOrder.findFirst({ where: { id: payment.externalReference, sellerId: account.userId, mpPaymentId: null }, select: orderSelect });
  if (!order) return;
  const claimed = await prisma.ticketOrder.updateMany({ where: { id: order.id, mpPaymentId: null }, data: { mpPaymentId: paymentId } });
  if (!claimed.count) return;
  console.warn("ticket-payment-adopted");
  await syncOrderWithPayment({ ...order, mpPaymentId: paymentId }, payment, { config, token, d });
}

export type ReconcileScope = { sellerId?: string; buyerId?: string; limit?: number };
export type ReconcileReport = { checked: number; failed: number };

/**
 * Safety net for missed webhooks: re-reads recent orders (last 24 hours) that have a Mercado Pago payment but are still
 * PENDING or EXPIRED, and applies the payment state. Used by the daily cron and, throttled, when the seller panel or
 * the buyer ticket list loads.
 */
export async function reconcileRecentTicketOrders(deps?: TicketDeps, scope: ReconcileScope = {}): Promise<ReconcileReport> {
  const d = resolveDeps(deps);
  const config = configuration(d);
  if (!config) return { checked: 0, failed: 0 };
  const now = d.now();
  const rows = await prisma.ticketOrder.findMany({
    where: {
      mpPaymentId: { not: null }, status: { in: ["PENDING", "EXPIRED"] }, createdAt: { gte: new Date(now.getTime() - RECONCILE_WINDOW_MS) },
      ...(scope.sellerId ? { sellerId: scope.sellerId } : {}), ...(scope.buyerId ? { buyerId: scope.buyerId } : {}),
    },
    orderBy: { createdAt: "asc" }, take: Math.min(Math.max(scope.limit ?? 100, 1), 200), select: orderSelect,
  });
  const tokens = new Map<string, string>();
  let checked = 0;
  let failed = 0;
  for (const order of rows) {
    if (!order.mpPaymentId) continue;
    try {
      const token = tokens.get(order.sellerId) ?? await sellerAccessToken(order.sellerId, config, d);
      tokens.set(order.sellerId, token);
      await syncOrderWithPayment(order, await getMercadoPagoPayment(config.apiBase, token, order.mpPaymentId, d.fetch), { config, token, d });
      checked++;
    } catch {
      failed++;
    }
  }
  const stranded = await findStrandedOrders(now, scope);
  for (const order of stranded) {
    if (!order.mpPaymentId) continue;
    try {
      const token = tokens.get(order.sellerId) ?? await sellerAccessToken(order.sellerId, config, d);
      tokens.set(order.sellerId, token);
      await settleStrandedOrder(order, await getMercadoPagoPayment(config.apiBase, token, order.mpPaymentId, d.fetch), { config, token, d });
      checked++;
    } catch {
      failed++;
    }
  }
  if (failed) console.warn("ticket-reconcile-partial");
  return { checked, failed };
}

/**
 * PAID orders with no registration row at all: a late oversold approval whose refund never ran (process died
 * between the two steps). grantTicket always creates the row and cancelling keeps it, so no row means no seat.
 */
async function findStrandedOrders(now: Date, scope: ReconcileScope): Promise<SyncOrder[]> {
  const paid = await prisma.ticketOrder.findMany({
    where: {
      mpPaymentId: { not: null }, status: "PAID", createdAt: { gte: new Date(now.getTime() - RECONCILE_WINDOW_MS) },
      ...(scope.sellerId ? { sellerId: scope.sellerId } : {}), ...(scope.buyerId ? { buyerId: scope.buyerId } : {}),
    },
    orderBy: { createdAt: "asc" }, take: 200, select: orderSelect,
  });
  if (!paid.length) return [];
  const registrations = await prisma.eventRegistration.findMany({
    where: { OR: paid.map((order) => ({ eventId: order.eventId, userId: order.buyerId })) },
    select: { eventId: true, userId: true },
  });
  const seated = new Set(registrations.map((row) => `${row.eventId}:${row.userId}`));
  return paid.filter((order) => !seated.has(`${order.eventId}:${order.buyerId}`));
}

/** Finishes the interrupted refund, or records one Mercado Pago already made. Same idempotency key as the first try. */
async function settleStrandedOrder(order: SyncOrder, payment: MercadoPagoPayment, ctx: SyncContext): Promise<void> {
  if (!paymentMatchesOrder(order, payment)) return;
  if (payment.status === "approved") await refundLateApproval(order, payment.id, ctx);
  else if (payment.status === "refunded" || payment.status === "charged_back") await markRefunded(order, ctx.d.now(), "sold_out");
}

const lastReconcile = new Map<string, number>();

/** Throttled per viewer so page loads stay cheap; a failure never breaks the page. */
async function reconcileOpportunistically(key: string, scope: ReconcileScope, d: Resolved): Promise<void> {
  if (!ticketPaymentsConfigured(d.env)) return;
  const nowMs = d.now().getTime();
  const last = lastReconcile.get(key);
  if (last !== undefined && nowMs - last < d.reconcileIntervalMs) return;
  lastReconcile.set(key, nowMs);
  if (lastReconcile.size > 5000) lastReconcile.clear();
  try {
    await reconcileRecentTicketOrders(d, { ...scope, limit: 20 });
  } catch {
    console.warn("ticket-reconcile-failed");
  }
}

// ---------- Refunds and panels ----------

export async function refundTicketOrder(rawInput: unknown, resolveAccountHolder: ResolveCurrentUser, deps?: TicketDeps): Promise<TicketResult> {
  const d = resolveDeps(deps);
  const user = await resolveAccountHolder();
  if (!user) return denied;
  const parsed = ticketOrderSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, message: "Pedido não encontrado." };
  const config = configuration(d);
  if (!config) return { success: false, message: notConfigured };
  try {
    const order = await prisma.ticketOrder.findUnique({ where: { id: parsed.data.orderId }, select: orderSelect });
    if (!order || (user.role !== "ADMIN" && order.sellerId !== user.id)) return denied;
    if (order.status !== "PAID" || !order.mpPaymentId) return { success: false, message: "Somente ingressos pagos podem ser estornados." };
    let token: string;
    try {
      token = await sellerAccessToken(order.sellerId, config, d);
    } catch (error) {
      if (isDisconnectedError(error)) return { success: false, message: sellerDisconnected };
      console.warn("ticket-refund-token-failed");
      return { success: false, message: refundProviderError };
    }
    try {
      await refundMercadoPagoPayment(config.apiBase, token, order.mpPaymentId, `refund-${order.id}`, d.fetch);
    } catch {
      console.warn("ticket-refund-provider-failed");
      return { success: false, message: refundProviderError };
    }
    // The money is already on its way back: from here on, never report a failure.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await markRefunded(order, d.now());
        return { success: true, message: "Estorno solicitado. O comprador recebe o valor de volta e foi avisado.", data: undefined };
      } catch {
        console.warn("ticket-refund-store-failed");
      }
    }
    return { success: true, message: "Estorno enviado ao Mercado Pago. O status do ingresso será atualizado em instantes.", data: undefined };
  } catch {
    console.warn("ticket-refund-failed");
    return genericError;
  }
}

function sellerOrder(row: { id: string; status: TicketOrderStatusValue; unitCents: number; feeCents: number; paidAt: Date | null; refundedAt: Date | null; buyer: { name: string | null } }): SellerOrderView {
  return { id: row.id, code: shortTicketCode(row.id), buyerName: row.buyer.name?.trim() || "Participante", status: row.status, unitCents: row.unitCents, feeCents: row.feeCents, paidAt: iso(row.paidAt), refundedAt: iso(row.refundedAt) };
}

export async function getPaymentsOverview(resolveViewer: ResolveCurrentUser, deps?: TicketDeps): Promise<TicketResult<PaymentsOverview>> {
  const d = resolveDeps(deps);
  const user = await resolveViewer();
  if (!user) return denied;
  const configured = ticketPaymentsConfigured(d.env);
  try {
    const now = d.now();
    const config = configuration(d);
    const stored = config ? await prisma.mercadoPagoAccount.findUnique({ where: { userId: user.id }, select: { expiresAt: true } }) : null;
    // Close to expiry: refresh now, so the panel shows whether the connection still works.
    if (config && stored && new Date(stored.expiresAt).getTime() - now.getTime() <= REFRESH_BEFORE_MS) {
      try { await sellerAccessToken(user.id, config, d); } catch { /* surfaced below as needsReconnect */ }
    }
    await reconcileOpportunistically(`seller:${user.id}`, { sellerId: user.id }, d);
    const [account, rows] = await Promise.all([
      prisma.mercadoPagoAccount.findUnique({ where: { userId: user.id }, select: { mpUserId: true, connectedAt: true, expiresAt: true } }),
      prisma.ticketOrder.findMany({
        where: { sellerId: user.id, status: { in: ["PAID", "REFUNDED"] } }, orderBy: { createdAt: "desc" }, take: 500,
        select: { id: true, eventId: true, status: true, unitCents: true, feeCents: true, paidAt: true, refundedAt: true, event: { select: { nome: true } }, buyer: { select: { name: true } } },
      }),
    ]);
    const byEvent = new Map<string, SellerEventSales>();
    for (const row of rows) {
      const entry = byEvent.get(row.eventId) ?? { eventId: row.eventId, eventName: row.event.nome, sold: 0, refunded: 0, grossCents: 0, feeCents: 0, netCents: 0, orders: [] };
      if (row.status === "PAID") {
        entry.sold += 1;
        entry.grossCents += row.unitCents;
        entry.feeCents += row.feeCents;
        entry.netCents += row.unitCents - row.feeCents;
      } else entry.refunded += 1;
      entry.orders.push(sellerOrder(row));
      byEvent.set(row.eventId, entry);
    }
    const events = Array.from(byEvent.values());
    const totals = events.reduce((sum, item) => ({ sold: sum.sold + item.sold, grossCents: sum.grossCents + item.grossCents, feeCents: sum.feeCents + item.feeCents, netCents: sum.netCents + item.netCents }), { sold: 0, grossCents: 0, feeCents: 0, netCents: 0 });
    return {
      success: true, message: "",
      data: { configured, feePercent: TICKET_FEE_PERCENT, account: account ? { mpUserId: account.mpUserId, connectedAt: new Date(account.connectedAt).toISOString(), needsReconnect: accountNeedsReconnect(account.expiresAt, now) } : null, events, totals },
    };
  } catch {
    console.warn("ticket-overview-failed");
    return genericError;
  }
}

export async function listMyTickets(resolveViewer: ResolveCurrentUser, deps?: TicketDeps): Promise<TicketResult<MyTicketView[]>> {
  const d = resolveDeps(deps);
  const user = await resolveViewer();
  if (!user) return denied;
  try {
    await reconcileOpportunistically(`buyer:${user.id}`, { buyerId: user.id }, d);
    const now = d.now();
    const rows = await prisma.ticketOrder.findMany({
      where: { buyerId: user.id, status: { in: ["PAID", "PENDING", "REFUNDED"] } }, orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, status: true, unitCents: true, expiresAt: true, paidAt: true, createdAt: true, eventId: true, sellerId: true, seller: { select: { name: true } }, event: { select: { nome: true, dataInicio: true, startTime: true } } },
    });
    return {
      success: true, message: "",
      data: rows.filter((row) => row.status !== "PENDING" || isOpenTicketOrder(row, now)).map((row) => ({
        id: row.id, code: shortTicketCode(row.id), status: row.status, unitCents: row.unitCents, eventId: row.eventId, eventName: row.event.nome,
        dataInicio: row.event.dataInicio, startTime: row.event.startTime, paidAt: iso(row.paidAt), createdAt: new Date(row.createdAt).toISOString(),
        organizerId: row.sellerId, organizerName: row.seller.name?.trim() || "Organizador",
      })),
    };
  } catch {
    console.warn("ticket-mine-failed");
    return genericError;
  }
}

export async function getAdminTicketOverview(resolveAdminId: ResolveAdminId, _deps?: TicketDeps): Promise<TicketResult<AdminTicketOverview>> {
  if (!await resolveAdminId()) return denied;
  try {
    const [paid, refunded, recent] = await Promise.all([
      prisma.ticketOrder.aggregate({ where: { status: "PAID" }, _sum: { unitCents: true, feeCents: true }, _count: { _all: true } }),
      prisma.ticketOrder.aggregate({ where: { status: "REFUNDED" }, _sum: { unitCents: true }, _count: { _all: true } }),
      prisma.ticketOrder.findMany({
        where: { status: { in: ["PAID", "REFUNDED"] } }, orderBy: { createdAt: "desc" }, take: 30,
        select: { id: true, eventId: true, status: true, unitCents: true, feeCents: true, paidAt: true, refundedAt: true, event: { select: { nome: true } }, buyer: { select: { name: true } }, seller: { select: { name: true } } },
      }),
    ]);
    return {
      success: true, message: "",
      data: {
        paid: { count: paid._count._all, grossCents: paid._sum.unitCents ?? 0, feeCents: paid._sum.feeCents ?? 0 },
        refunded: { count: refunded._count._all, grossCents: refunded._sum.unitCents ?? 0 },
        recent: recent.map((row) => ({ ...sellerOrder(row), eventId: row.eventId, eventName: row.event.nome, sellerName: row.seller.name?.trim() || "Organizador" })),
      },
    };
  } catch {
    console.warn("ticket-admin-overview-failed");
    return genericError;
  }
}
