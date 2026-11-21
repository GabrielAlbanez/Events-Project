export const METRIC_CONSENT_COOKIE = "eventmap_metrics";
export const METRIC_CONSENT_EVENT = "eventmap:metrics-consent";

export function hasMetricConsent(): boolean {
  return typeof document !== "undefined" && document.cookie.split(";").some(part => part.trim() === `${METRIC_CONSENT_COOKIE}=yes`);
}

export function setMetricConsent(enabled: boolean): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${METRIC_CONSENT_COOKIE}=${enabled ? "yes" : "no"}; Path=/; Max-Age=${180 * 86400}; SameSite=Lax${secure}`;
  // HttpOnly metric cookies must be removed by the server. Consent is checked
  // before every write, so failed cleanup can never enable new measurements.
  if (!enabled) void fetch("/api/privacy/metrics", { method: "DELETE", credentials: "same-origin" }).catch(() => undefined);
  window.dispatchEvent(new Event(METRIC_CONSENT_EVENT));
}
