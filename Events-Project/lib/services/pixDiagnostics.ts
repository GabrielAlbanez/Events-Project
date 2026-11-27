import { createHash } from "node:crypto";
import prisma from "@/lib/prisma";
import type { ResolveCurrentUser } from "@/lib/services/authContext";
import { TICKET_ORDER_TTL_MS, ticketOrderTotals } from "@/lib/tickets";
import { TicketConfigError, ticketPaymentsConfigured } from "@/lib/ticketSecurity";
import {
  MercadoPagoError, cancelMercadoPagoPayment, createMercadoPagoPixPayment, getMercadoPagoPlatformUserId, getMercadoPagoUser, listMercadoPagoPaymentMethodIds,
  type MercadoPagoConfig, type MercadoPagoUser,
} from "@/lib/mercadopago";
import { pixDiagnosticsSchema } from "@/schemas/tickets";
import {
  DIAGNOSTIC_REFERENCE_PREFIX, FEE_REFUSED_CAUSE, configuration, feeRefusedKey, pixFailureDetail, resolveDeps, sellerAccessToken,
  type ResolvedTicketDeps, type TicketDeps, type TicketResult,
} from "@/lib/services/tickets";

/**
 * "Diagnóstico do Pix": tells the organizer, before any buyer tries, whether Mercado Pago will create Pix for the
 * connected account, and why not. Read-only checks plus an optional live test (R$ 1,00 Pix with the real EventMap
 * fee, cancelled right away). Nothing here creates orders, tickets or notifications; logs carry stage/status/cause codes only.
 */
export type PixCheckId = "connection" | "platform_owner" | "pix_method" | "fee_refused" | "live_test";
export type PixCheckStatus = "ok" | "warn" | "fail";
export type PixCheckAction = "connect" | "reconnect" | "switch_account" | "pix_key_help" | "run_test" | "retry" | null;
export type PixCheck = { id: PixCheckId; status: PixCheckStatus; title: string; message: string; action: PixCheckAction };
export type PixDiagnosis = {
  configured: boolean;
  overall: PixCheckStatus;
  /** True only when the live test was accepted by Mercado Pago and no check failed. */
  verified: boolean;
  headline: string;
  accountLabel: string | null;
  checkedAt: string;
  checks: PixCheck[];
};

export const PIX_TEST_AMOUNT_CENTS = 100;
export const PIX_TEST_DESCRIPTION = "Teste EventMap — não pague";
export const PIX_CHECK_LIMIT = 20;
export const PIX_TEST_LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;
const PLATFORM_ID_TTL_MS = 6 * 60 * 60 * 1000;
/** Mercado Pago cause codes (developers reference, POST /v1/payments). */
const CAUSE = { pixKeyMissing: "13253", usersInvolved: "2034", feeTooBig: "4038", feeNegative: "4039", invalidAmount: "4037", payerEmail: "4050", payerEmailLong: "4051" } as const;

const denied = { success: false as const, message: "Acesso negado." };
const unavailable = { success: false as const, message: "Não foi possível verificar agora. Tente novamente em alguns minutos." };
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const rank: Record<PixCheckStatus, number> = { ok: 0, warn: 1, fail: 2 };

// ---------- Platform account (who owns the EventMap app) ----------

let platformCache: { key: string; id: string; at: number } | null = null;
/** Test hook: forgets the cached platform account id. */
export function clearPlatformUserIdCache(): void { platformCache = null; }

/**
 * `MP_PLATFORM_USER_ID` when set (numeric), else the `user_id` of a client_credentials token, which belongs to the
 * application owner. Null when it cannot be determined; the live test then is the only proof.
 */
async function platformUserId(config: MercadoPagoConfig, d: ResolvedTicketDeps): Promise<string | null> {
  const configured = d.env.MP_PLATFORM_USER_ID?.trim();
  if (configured && /^\d{1,20}$/.test(configured)) return configured;
  const key = sha(`${config.apiBase}|${config.clientId}`);
  const now = d.now().getTime();
  if (platformCache && platformCache.key === key && now - platformCache.at < PLATFORM_ID_TTL_MS) return platformCache.id;
  try {
    const id = await getMercadoPagoPlatformUserId(config, d.fetch);
    platformCache = { key, id, at: now };
    return id;
  } catch (error) {
    console.warn("pix-diagnostic-platform-id-failed", pixFailureDetail(error));
    return null;
  }
}

// ---------- Checks ----------

const check = (id: PixCheckId, status: PixCheckStatus, title: string, message: string, action: PixCheckAction = null): PixCheck => ({ id, status, title, message, action });

type SellerContext = { token: string; user: MercadoPagoUser; storedMpUserId: string };
type Base = { checks: PixCheck[]; seller: SellerContext | null; label: string | null };

async function baseChecks(userId: string, config: MercadoPagoConfig, d: ResolvedTicketDeps): Promise<Base> {
  const account = await prisma.mercadoPagoAccount.findUnique({ where: { userId }, select: { mpUserId: true, connectedAt: true, expiresAt: true } });
  if (!account) {
    return { seller: null, label: null, checks: [check("connection", "fail", "Conta do Mercado Pago", "Nenhuma conta do Mercado Pago está conectada. Sem ela, ninguém consegue pagar por Pix nos seus eventos.", "connect")] };
  }
  const feeRefused = Boolean(await prisma.notification.findFirst({ where: { userId, groupKey: feeRefusedKey(userId, account.connectedAt) }, select: { id: true } }));
  const feeCheck = feeRefused
    ? check("fee_refused", "fail", "Recusas recentes", "Uma tentativa de compra nesta conta foi recusada pelo Mercado Pago porque ele não aceitou a taxa do EventMap (código 2059).", "switch_account")
    : check("fee_refused", "ok", "Recusas recentes", "Nenhuma recusa da taxa do EventMap foi registrada desde que esta conta foi conectada.");
  const reconnect = (message: string): Base => ({ seller: null, label: null, checks: [check("connection", "fail", "Conta do Mercado Pago", message, "reconnect"), feeCheck] });
  let token: string;
  let user: MercadoPagoUser;
  try {
    token = await sellerAccessToken(userId, config, d);
    user = await getMercadoPagoUser(config.apiBase, token, d.fetch);
  } catch (error) {
    console.warn("pix-diagnostic-connection-failed", pixFailureDetail(error));
    if (error instanceof TicketConfigError) return { seller: null, label: null, checks: [check("connection", "warn", "Conta do Mercado Pago", "Não foi possível ler a conexão por um problema de configuração do EventMap. Avise o suporte; nada foi alterado na sua conta.", null), feeCheck] };
    if (error instanceof Error && (error.message === "SELLER_TOKEN_EXPIRED" || error.message === "SELLER_NOT_CONNECTED")) return reconnect("A autorização do Mercado Pago expirou ou foi revogada. Reconecte a conta para voltar a vender.");
    if (error instanceof MercadoPagoError && (error.status === 401 || error.status === 403)) return reconnect("O Mercado Pago não aceitou mais a autorização desta conta. Reconecte a conta para voltar a vender.");
    return { seller: null, label: null, checks: [check("connection", "warn", "Conta do Mercado Pago", "Não conseguimos falar com o Mercado Pago agora para confirmar a conta. Tente verificar de novo em alguns minutos.", "retry"), feeCheck] };
  }
  const label = user.label;
  const checks: PixCheck[] = [check("connection", "ok", "Conta do Mercado Pago", label ? `Conectada e respondendo como ${label}.` : "Conectada e respondendo ao Mercado Pago.")];
  const seller: SellerContext = { token, user, storedMpUserId: account.mpUserId };

  const sellerId = user.id ?? account.mpUserId;
  const platform = await platformUserId(config, d);
  checks.push(!platform
    ? check("platform_owner", "warn", "Conta diferente da plataforma", "Não foi possível confirmar se esta é a mesma conta dona do EventMap. O teste de recebimento confirma se o Mercado Pago aceita a taxa.", "run_test")
    : platform === sellerId
      ? check("platform_owner", "fail", "Conta diferente da plataforma", "Esta é a mesma conta do Mercado Pago que é dona do EventMap. Nela o Mercado Pago não aceita a taxa da plataforma e recusa o Pix. Conecte outra conta, a que deve receber pelos ingressos.", "switch_account")
      : check("platform_owner", "ok", "Conta diferente da plataforma", "A conta conectada não é a conta dona do EventMap."));

  try {
    const methods = await listMercadoPagoPaymentMethodIds(config.apiBase, token, d.fetch);
    checks.push(methods.includes("pix")
      ? check("pix_method", "ok", "Pix na conta", "O Mercado Pago lista o Pix entre os meios de pagamento desta conta. A chave Pix só é confirmada pelo teste de recebimento.", "run_test")
      : check("pix_method", "fail", "Pix na conta", "O Mercado Pago não lista o Pix entre os meios de pagamento desta conta. Confira no Mercado Pago se a conta pode receber Pix e se tem uma chave Pix cadastrada.", "pix_key_help"));
  } catch (error) {
    console.warn("pix-diagnostic-methods-failed", pixFailureDetail(error));
    checks.push(check("pix_method", "warn", "Pix na conta", "Não conseguimos consultar os meios de pagamento da conta agora. O teste de recebimento também verifica o Pix.", "run_test"));
  }
  checks.push(feeCheck);
  return { checks, seller, label };
}

/** Live test: a real Pix of R$ 1,00 with the same fee rule as tickets, never shown to anyone and cancelled at once. */
async function liveTest(userId: string, clientId: string, seller: SellerContext, config: MercadoPagoConfig, d: ResolvedTicketDeps): Promise<PixCheck> {
  const title = "Teste de recebimento";
  const organizer = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const payerEmail = organizer?.email?.trim() ?? "";
  if (!payerEmail) return check("live_test", "warn", title, "Cadastre um e-mail na sua conta do EventMap para fazer o teste: o Mercado Pago exige um e-mail de pagador.", null);
  if (seller.user.label && seller.user.label.toLowerCase() === payerEmail.toLowerCase()) {
    return check("live_test", "warn", title, "O teste não foi feito: o e-mail da sua conta no EventMap é o mesmo da conta do Mercado Pago, e o Mercado Pago não aceita pagador e recebedor iguais. Isso não afeta quem compra seus ingressos.", null);
  }
  const { feeCents } = ticketOrderTotals(PIX_TEST_AMOUNT_CENTS, 1);
  let paymentId: string;
  try {
    const pix = await createMercadoPagoPixPayment(config.apiBase, seller.token, {
      orderId: `diagnostic-${sha(`${userId}:${clientId}`).slice(0, 40)}`,
      externalReference: `${DIAGNOSTIC_REFERENCE_PREFIX}${clientId}`,
      amountCents: PIX_TEST_AMOUNT_CENTS, feeCents, description: PIX_TEST_DESCRIPTION, payerEmail,
      notificationUrl: null, expiresAt: new Date(d.now().getTime() + TICKET_ORDER_TTL_MS), metadata: { diagnostic: true },
    }, d.fetch);
    paymentId = pix.paymentId;
  } catch (error) {
    console.warn("pix-diagnostic-test-refused", pixFailureDetail(error));
    return testFailure(error);
  }
  try {
    await cancelMercadoPagoPayment(config.apiBase, seller.token, paymentId, d.fetch);
  } catch (error) {
    console.warn("pix-diagnostic-test-cancel-failed", pixFailureDetail(error));
    return check("live_test", "warn", title, "O Mercado Pago aceitou o Pix de teste com a taxa do EventMap, mas não confirmou o cancelamento. O código nunca foi mostrado a ninguém e expira sozinho em 30 minutos; se ele aparecer na sua conta, não pague.", null);
  }
  console.warn("pix-diagnostic-test-accepted", "stage=cancelled");
  return check("live_test", "ok", title, "O Mercado Pago gerou um Pix de teste de R$ 1,00 com a taxa do EventMap e ele foi cancelado na hora. Nenhum valor foi cobrado.");
}

function testFailure(error: unknown): PixCheck {
  const title = "Teste de recebimento";
  if (!(error instanceof MercadoPagoError)) return check("live_test", "warn", title, "Não foi possível fazer o teste agora. Tente de novo em alguns minutos.", "retry");
  const causes = error.causes;
  if (error.code.endsWith("_network")) return check("live_test", "warn", title, "Não conseguimos falar com o Mercado Pago agora. Tente o teste de novo em alguns minutos.", "retry");
  if (causes.includes(FEE_REFUSED_CAUSE)) return check("live_test", "fail", title, "O Mercado Pago recusou o Pix porque não aceita a taxa do EventMap nesta conta (código 2059). Isso acontece quando a conta conectada é a dona do EventMap ou não foi autorizada pelo EventMap. Conecte outra conta.", "switch_account");
  if (causes.includes(CAUSE.pixKeyMissing)) return check("live_test", "fail", title, "O Mercado Pago recusou o Pix porque esta conta não tem chave Pix habilitada para gerar QR Code (código 13253). Cadastre uma chave Pix no Mercado Pago e teste de novo.", "pix_key_help");
  if (causes.includes(CAUSE.usersInvolved)) return check("live_test", "warn", title, "O Mercado Pago recusou o teste por causa dos usuários envolvidos (código 2034). Costuma acontecer quando o e-mail da sua conta no EventMap pertence à mesma conta que recebe, então o teste não é conclusivo para compradores.", null);
  if (causes.includes(CAUSE.payerEmail) || causes.includes(CAUSE.payerEmailLong)) return check("live_test", "warn", title, "O Mercado Pago não aceitou o e-mail da sua conta do EventMap como pagador do teste. Confira o e-mail cadastrado e teste de novo.", null);
  if (causes.includes(CAUSE.feeTooBig) || causes.includes(CAUSE.feeNegative) || causes.includes(CAUSE.invalidAmount)) return check("live_test", "fail", title, "O Mercado Pago recusou o valor ou a taxa do teste. É um problema do lado do EventMap: avise o suporte.", null);
  if (error.status === 401 || error.status === 403) return check("live_test", "fail", title, "O Mercado Pago não aceitou a autorização desta conta para criar Pix. Reconecte a conta e teste de novo.", "reconnect");
  const codes = causes.filter((code) => /^\d{1,6}$/.test(code));
  return check("live_test", "warn", title, `O Mercado Pago recusou o Pix de teste${codes.length ? ` (código ${codes.join(", ")})` : ""}. Tente de novo mais tarde; se continuar, fale com o suporte do Mercado Pago.`, "retry");
}

function summarize(configured: boolean, checks: PixCheck[], label: string | null, now: Date): PixDiagnosis {
  const overall = checks.reduce<PixCheckStatus>((worst, item) => (rank[item.status] > rank[worst] ? item.status : worst), "ok");
  const tested = checks.find((item) => item.id === "live_test");
  const verified = overall !== "fail" && tested?.status === "ok";
  const headline = overall === "fail" ? "Pix com problema — veja o diagnóstico"
    : verified ? "Pix pronto para vender"
      : "Nenhum problema encontrado — faça o teste de recebimento para confirmar";
  return { configured, overall, verified, headline, accountLabel: label, checkedAt: now.toISOString(), checks };
}

// ---------- Rate limit (VerificationToken rows, same table/prefix as lib/rateLimit.ts; no schema change) ----------

type LimitOutcome = "allowed" | "duplicate" | "limited";
/** One row per click: the same clientId never counts twice; the window admits at most `limit` distinct clicks. */
async function consumeClick(userId: string, kind: "check" | "test", clientId: string, now: Date): Promise<LimitOutcome> {
  const limit = kind === "test" ? PIX_TEST_LIMIT : PIX_CHECK_LIMIT;
  const window = Math.floor(now.getTime() / WINDOW_MS);
  const identifier = `auth-rate:pix-${kind}:user:${sha(userId)}:${window}`;
  const token = `pix-click:${sha(`${kind}:${userId}:${clientId}`)}`;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identifier}, 0))`;
    if (await tx.verificationToken.findFirst({ where: { token }, select: { token: true } })) return "duplicate";
    if (await tx.verificationToken.count({ where: { identifier } }) >= limit) return "limited";
    await tx.verificationToken.create({ data: { identifier, token, expires: new Date((window + 1) * WINDOW_MS) } });
    await tx.verificationToken.deleteMany({ where: { identifier: { startsWith: "auth-rate:pix-" }, expires: { lt: now } } });
    return "allowed";
  });
}

// ---------- Entry points ----------

/** Read-only checks for the organizer's own connection (no payment is created). */
export async function diagnosePayments(organizerId: string, deps?: TicketDeps): Promise<PixDiagnosis> {
  const d = resolveDeps(deps);
  const now = d.now();
  const config = ticketPaymentsConfigured(d.env) ? configuration(d) : null;
  if (!config) return summarize(false, [check("connection", "fail", "Pagamentos do EventMap", "Os pagamentos ainda não foram configurados no EventMap.", null)], null, now);
  const base = await baseChecks(organizerId, config, d);
  return summarize(true, base.checks, base.label, now);
}

/** Checks plus the live R$ 1,00 test (skipped when the connection itself is not usable). */
export async function testPixReceipt(organizerId: string, clientId: string, deps?: TicketDeps): Promise<PixDiagnosis> {
  const d = resolveDeps(deps);
  const now = d.now();
  const config = ticketPaymentsConfigured(d.env) ? configuration(d) : null;
  if (!config) return summarize(false, [check("connection", "fail", "Pagamentos do EventMap", "Os pagamentos ainda não foram configurados no EventMap.", null)], null, now);
  const base = await baseChecks(organizerId, config, d);
  if (!base.seller) return summarize(true, [...base.checks, check("live_test", "warn", "Teste de recebimento", "O teste não foi feito porque a conta do Mercado Pago não está pronta. Resolva o item acima e teste de novo.", null)], base.label, now);
  const tested = await liveTest(organizerId, clientId, base.seller, config, d);
  return summarize(true, [...base.checks, tested], base.label, now);
}

/** Session-bound wrapper used by the API route: only the signed-in organizer's own account, with per-click limits. */
export async function runPixDiagnostics(rawInput: unknown, resolveAccountHolder: ResolveCurrentUser, deps?: TicketDeps): Promise<TicketResult<PixDiagnosis> & { status: number }> {
  const user = await resolveAccountHolder();
  if (!user) return { ...denied, status: 401 };
  if (user.role !== "PROMOTER" && user.role !== "ADMIN") return { ...denied, status: 403 };
  const parsed = pixDiagnosticsSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, message: "Solicitação inválida.", status: 400 };
  const d = resolveDeps(deps);
  const { action, clientId } = parsed.data;
  try {
    const outcome = await consumeClick(user.id, action, clientId, d.now());
    if (outcome === "limited") {
      return { success: false, status: 429, message: action === "test" ? `Você já fez ${PIX_TEST_LIMIT} testes de recebimento na última hora. Tente de novo mais tarde.` : "Muitas verificações em pouco tempo. Tente de novo mais tarde." };
    }
    // A repeated click (same clientId) never creates a second test payment.
    const data = action === "test" && outcome === "allowed" ? await testPixReceipt(user.id, clientId, deps) : await diagnosePayments(user.id, deps);
    console.warn("pix-diagnostic", `action=${action} overall=${data.overall} checks=${data.checks.map((item) => `${item.id}:${item.status}`).join(",")}${outcome === "duplicate" ? " repeat=1" : ""}`);
    return { success: true, message: "", data, status: 200 };
  } catch (error) {
    console.warn("pix-diagnostic-failed", pixFailureDetail(error));
    return { ...unavailable, status: 503 };
  }
}
