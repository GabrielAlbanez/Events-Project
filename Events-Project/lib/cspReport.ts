/**
 * Sanitizes CSP violation reports (report-uri and Reporting API formats) into one fixed-shape log
 * line each. Only the directive, the blocked origin/keyword and the document pathname survive:
 * no query strings, fragments, credentials, IPs, user ids or cookies are ever logged.
 */

export const CSP_REPORT_MAX_BYTES = 8 * 1024;
export const CSP_REPORT_MAX_LOGS_PER_MINUTE = 50;

const MAX_FIELD_LENGTH = 120;
const MAX_REPORTS_PER_REQUEST = 10;
const ACCEPTED_TYPES = new Set(["application/csp-report", "application/reports+json"]);

type CspFields = { directive: unknown; blocked: unknown; document: unknown };

export function isAcceptedCspReportType(contentType: string | null): boolean {
  const mediaType = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return ACCEPTED_TYPES.has(mediaType);
}

function truncate(value: string): string {
  return value.slice(0, MAX_FIELD_LENGTH);
}

function sanitizeDirective(value: unknown): string {
  if (typeof value !== "string") return "unknown";
  const directive = value.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return /^[a-z-]+$/.test(directive) ? truncate(directive) : "unknown";
}

/** Origin for URLs, the bare scheme/keyword otherwise ("inline", "eval", "data", "blob"...). */
function sanitizeBlocked(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "unknown";
  const raw = value.trim();
  try {
    const url = new URL(raw);
    if ((url.protocol === "http:" || url.protocol === "https:" || url.protocol === "ws:" || url.protocol === "wss:") && url.host) {
      return truncate(`${url.protocol}//${url.host}`);
    }
    const scheme = url.protocol.replace(/:$/, "").toLowerCase();
    return /^[a-z][a-z0-9+.-]*$/.test(scheme) ? truncate(scheme) : "unknown";
  } catch {
    const keyword = raw.toLowerCase();
    return /^[a-z][a-z0-9-]*$/.test(keyword) ? truncate(keyword) : "unknown";
  }
}

function sanitizeDocument(value: unknown): string {
  if (typeof value !== "string") return "unknown";
  try {
    const pathname = new URL(value).pathname || "/";
    return truncate(pathname.replace(/[^A-Za-z0-9/._~%!$&'()*+,;=:@-]/g, ""));
  } catch {
    return "unknown";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractFields(payload: unknown, reportsApi: boolean): CspFields[] {
  if (reportsApi) {
    if (!Array.isArray(payload)) return [];
    return payload
      .slice(0, MAX_REPORTS_PER_REQUEST)
      .filter((entry): entry is Record<string, unknown> => isRecord(entry) && entry.type === "csp-violation" && isRecord(entry.body))
      .map((entry) => {
        const body = entry.body as Record<string, unknown>;
        return { directive: body.effectiveDirective, blocked: body.blockedURL, document: body.documentURL ?? entry.url };
      });
  }
  if (!isRecord(payload) || !isRecord(payload["csp-report"])) return [];
  const report = payload["csp-report"];
  return [{ directive: report["effective-directive"] ?? report["violated-directive"], blocked: report["blocked-uri"], document: report["document-uri"] }];
}

/** Returns the log lines for a report body; malformed or unknown payloads yield none. */
export function cspReportLines(contentType: string | null, text: string): string[] {
  if (!isAcceptedCspReportType(contentType)) return [];
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return [];
  }
  const reportsApi = (contentType ?? "").toLowerCase().includes("reports+json");
  return extractFields(payload, reportsApi).map(
    (fields) => `csp-violation directive=${sanitizeDirective(fields.directive)} blocked=${sanitizeBlocked(fields.blocked)} doc=${sanitizeDocument(fields.document)}`,
  );
}

/** Reads at most `maxBytes` of the body; returns null when the body is larger. */
export async function readCappedBody(request: Request, maxBytes: number = CSP_REPORT_MAX_BYTES): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** Fixed-window, per-instance log budget. */
export function createLogBudget(max: number = CSP_REPORT_MAX_LOGS_PER_MINUTE, windowMs = 60_000, now: () => number = Date.now) {
  let windowStart = now();
  let used = 0;
  return function take(): boolean {
    const current = now();
    if (current - windowStart >= windowMs) {
      windowStart = current;
      used = 0;
    }
    if (used >= max) return false;
    used++;
    return true;
  };
}
