import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { createNotification } from "@/lib/notifications/create";
import { notificationCopy } from "@/lib/notifications/catalog";
import type { ResolveAdminId, ResolveCurrentUser } from "@/lib/services/authContext";
import {
  TICKET_FEE_PERCENT, TICKET_ORDER_RATE_LIMIT, TICKET_ORDER_RATE_WINDOW_MS, TICKET_ORDER_TTL_MS,
  isOpenTicketOrder, shortTicketCode, ticketEligibility, ticketFeeCents, ticketSeatsLeft, ticketSettingsError,
  type TicketBlockCode, type TicketOrderStatusValue,
} from "@/lib/tickets";
import { decryptTicketToken, encryptTicketToken, signOAuthState, ticketPaymentsConfigured, verifyMercadoPagoSignature, verifyOAuthState } from "@/lib/ticketSecurity";
import {
  createMercadoPagoPixPayment, exchangeMercadoPagoCode, getMercadoPagoPayment, mercadoPagoAuthorizeUrl, mercadoPagoConfig,
  refreshMercadoPagoToken, refundMercadoPagoPayment, type MercadoPagoConfig, type MercadoPagoPayment, type MpFetch,
} from "@/lib/mercadopago";
import { connectCallbackSchema, createTicketOrderSchema, ticketOrderSchema } from "@/schemas/tickets";

type Env = Record<string, string | undefined>;
/** Everything external is injectable so the offline suite never touches the network or the real clock. */
export type TicketDeps = { fetch?: MpFetch; now?: () => Date; env?: Env; statusCheckIntervalMs?: number };
type Resolved = { fetch: MpFetch; now: () => Date; env: Env; statusCheckIntervalMs: number };
const resolveDeps = (deps: TicketDeps = {}): Resolved => ({
  fetch: deps.fetch ?? ((input, init) => fetch(input, init)),
  now: deps.now ?? (() => new Date()),
  env: deps.env ?? process.env,
  statusCheckIntervalMs: deps.statusCheckIntervalMs ?? 10_000,
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
  account: { mpUserId: string; connectedAt: string } | null;
  events: SellerEventSales[];
  totals: { sold: number; grossCents: number; feeCents: number; netCents: number };
};
export type MyTicketView = { id: string; code: string; status: TicketOrderStatusValue; unitCents: number; eventId: string; eventName: string; dataInicio: string; startTime: string | null; paidAt: string | null; createdAt: string };
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
const RETRIES = 3;

function isRetryable(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

/** Serializable transaction with retry on serialization conflicts (two buyers racing for the last seat). */
async function serializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!isRetryable(error) || attempt >= RETRIES - 1) throw error;
    }
  }
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

async function sellerConnected(db: Pick<Prisma.TransactionClient, "mercadoPagoAccount">, sellerId: string | null): Promise<boolean> {
  if (!sellerId) return false;
  return Boolean(await db.mercadoPagoAccount.findUnique({ where: { userId: sellerId }, select: { id: true } }));
}

/** Seller access token, refreshed when it expires within a week. Never leaves the server. */
async function sellerAccessToken(sellerId: string, config: MercadoPagoConfig, d: Resolved): Promise<string> {
  const account = await prisma.mercadoPagoAccount.findUnique({ where: { userId: sellerId }, select: { id: true, accessTokenEnc: true, refreshTokenEnc: true, expiresAt: true } });
  if (!account) throw new Error("SELLER_NOT_CONNECTED");
  const now = d.now();
  const expiresAt = new Date(account.expiresAt).getTime();
  if (expiresAt - now.getTime() > REFRESH_BEFORE_MS) return decryptTicketToken(account.accessTokenEnc, d.env);
  try {
    const tokens = await refreshMercadoPagoToken(config, decryptTicketToken(account.refreshTokenEnc, d.env), d.fetch);
    await prisma.mercadoPagoAccount.update({
      where: { userId: sellerId },
      data: {
        accessTokenEnc: encryptTicketToken(tokens.accessToken, d.env), refreshTokenEnc: encryptTicketToken(tokens.refreshToken, d.env),
        expiresAt: new Date(now.getTime() + tokens.expiresInSeconds * 1000), mpUserId: tokens.mpUserId, updatedAt: now,
      },
    });
    return tokens.accessToken;
  } catch {
    console.warn("ticket-token-refresh-failed");
    if (expiresAt > now.getTime()) return decryptTicketToken(account.accessTokenEnc, d.env);
    throw new Error("SELLER_TOKEN_EXPIRED");
  }
}

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

export type ConnectOutcome = "connected" | "denied" | "invalid" | "error" | "unavailable";

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
      const order = await tx.ticketOrder.create({
        data: {
          eventId: event.id, buyerId: user.id, sellerId: event.userId!, unitCents: event.priceCents, feeCents: ticketFeeCents(event.priceCents),
          expiresAt: new Date(now.getTime() + TICKET_ORDER_TTL_MS),
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
  try {
    const token = await sellerAccessToken(order.sellerId, config, d);
    const pix = await createMercadoPagoPixPayment(config.apiBase, token, {
      orderId: order.id, amountCents: order.unitCents, feeCents: order.feeCents, description: `Ingresso: ${outcome.eventName}`,
      payerEmail: outcome.payerEmail, notificationUrl: notificationUrl(d.env), expiresAt: order.expiresAt,
    }, d.fetch);
    await prisma.ticketOrder.updateMany({ where: { id: order.id, status: "PENDING" }, data: { mpPaymentId: pix.paymentId, pixCopyPaste: pix.qrCode, pixQrBase64: pix.qrCodeBase64 } });
    return { success: true, message: "Pix gerado. Pague em até 30 minutos.", data: toView({ ...order, mpPaymentId: pix.paymentId, pixCopyPaste: pix.qrCode, pixQrBase64: pix.qrCodeBase64 }) };
  } catch {
    console.warn("ticket-pix-create-failed");
    try {
      await prisma.ticketOrder.updateMany({ where: { id: order.id, status: "PENDING" }, data: { status: "CANCELLED" } });
    } catch {
      console.warn("ticket-order-cancel-failed");
    }
    return pixError;
  }
}

// ---------- Confirmation (webhook + live check) ----------

type SyncOrder = { id: string; eventId: string; buyerId: string; status: TicketOrderStatusValue; unitCents: number; event: { nome: string } };

/**
 * Applies Mercado Pago's view of a payment to an order. Idempotent: status-guarded updates mean repeated webhooks
 * or concurrent live checks change the order (and create the registration) at most once.
 */
async function syncOrderWithPayment(order: SyncOrder, payment: MercadoPagoPayment, now: Date): Promise<void> {
  if (payment.externalReference !== order.id || payment.amountCents !== order.unitCents) {
    console.warn("ticket-payment-mismatch");
    return;
  }
  if (payment.status === "approved") {
    await serializable(async (tx) => {
      // EXPIRED is accepted too: a Pix approved at the deadline was paid and must be honored.
      const changed = await tx.ticketOrder.updateMany({ where: { id: order.id, status: { in: ["PENDING", "EXPIRED"] } }, data: { status: "PAID", paidAt: now } });
      if (!changed.count) return;
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
    });
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

async function markRefunded(order: SyncOrder, now: Date): Promise<boolean> {
  return serializable(async (tx) => {
    const changed = await tx.ticketOrder.updateMany({ where: { id: order.id, status: "PAID" }, data: { status: "REFUNDED", refundedAt: now } });
    if (!changed.count) return false;
    // A ticket already used at the door keeps its check-in record.
    await tx.eventRegistration.updateMany({ where: { eventId: order.eventId, userId: order.buyerId, status: { in: ["CONFIRMED", "WAITLISTED"] } }, data: { status: "CANCELLED", qrVersion: { increment: 1 } } });
    await createNotification(tx, notificationCopy({
      userId: order.buyerId, type: "SYSTEM" as const, href: "/ingressos", groupKey: `ticket-refund:${order.id}`,
      title: "Ingresso estornado", message: `${order.event.nome}: o valor do ingresso foi devolvido pelo Mercado Pago.`,
    }));
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
        await syncOrderWithPayment(order, await getMercadoPagoPayment(config.apiBase, token, order.mpPaymentId, d.fetch), d.now());
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

export type WebhookInput = { xSignature: string | null; xRequestId: string | null; dataId: string | null; type: string | null };

/**
 * Mercado Pago webhook. The body is never trusted: the signature is checked, then the payment is read from the API
 * with the seller token and matched against the stored order. Returns the HTTP status to answer with.
 */
export async function handleMercadoPagoWebhook(input: WebhookInput, deps?: TicketDeps): Promise<number> {
  const d = resolveDeps(deps);
  if (!verifyMercadoPagoSignature({ xSignature: input.xSignature, xRequestId: input.xRequestId, dataId: input.dataId, secret: d.env.MP_WEBHOOK_SECRET })) return 400;
  if (input.type !== "payment") return 200;
  if (!input.dataId || !/^\d{1,20}$/.test(input.dataId)) return 400;
  const config = configuration(d);
  if (!config) return 200;
  try {
    const order = await prisma.ticketOrder.findUnique({ where: { mpPaymentId: input.dataId }, select: orderSelect });
    if (!order) return 200;
    const token = await sellerAccessToken(order.sellerId, config, d);
    const payment = await getMercadoPagoPayment(config.apiBase, token, input.dataId, d.fetch);
    await syncOrderWithPayment(order, payment, d.now());
    return 200;
  } catch {
    // Transient failure (database or Mercado Pago): a non-2xx answer makes Mercado Pago retry later.
    console.warn("ticket-webhook-failed");
    return 500;
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
    try {
      const token = await sellerAccessToken(order.sellerId, config, d);
      await refundMercadoPagoPayment(config.apiBase, token, order.mpPaymentId, `refund-${order.id}`, d.fetch);
    } catch {
      console.warn("ticket-refund-provider-failed");
      return { success: false, message: "O Mercado Pago não confirmou o estorno agora. Nada foi alterado; tente novamente em alguns minutos." };
    }
    await markRefunded(order, d.now());
    return { success: true, message: "Estorno solicitado. O comprador recebe o valor de volta e foi avisado.", data: undefined };
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
    const [account, rows] = await Promise.all([
      prisma.mercadoPagoAccount.findUnique({ where: { userId: user.id }, select: { mpUserId: true, connectedAt: true } }),
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
      data: { configured, feePercent: TICKET_FEE_PERCENT, account: account ? { mpUserId: account.mpUserId, connectedAt: new Date(account.connectedAt).toISOString() } : null, events, totals },
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
    const now = d.now();
    const rows = await prisma.ticketOrder.findMany({
      where: { buyerId: user.id, status: { in: ["PAID", "PENDING", "REFUNDED"] } }, orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, status: true, unitCents: true, expiresAt: true, paidAt: true, createdAt: true, eventId: true, event: { select: { nome: true, dataInicio: true, startTime: true } } },
    });
    return {
      success: true, message: "",
      data: rows.filter((row) => row.status !== "PENDING" || isOpenTicketOrder(row, now)).map((row) => ({
        id: row.id, code: shortTicketCode(row.id), status: row.status, unitCents: row.unitCents, eventId: row.eventId, eventName: row.event.nome,
        dataInicio: row.event.dataInicio, startTime: row.event.startTime, paidAt: iso(row.paidAt), createdAt: new Date(row.createdAt).toISOString(),
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
