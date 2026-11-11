"use client";

import { useEffect, useState } from "react";
import { hasMetricConsent, METRIC_CONSENT_EVENT, setMetricConsent } from "@/lib/metricConsent";

export function MetricPreference() {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const sync = () => setEnabled(hasMetricConsent());
    sync();
    setReady(true);
    window.addEventListener(METRIC_CONSENT_EVENT, sync);
    return () => window.removeEventListener(METRIC_CONSENT_EVENT, sync);
  }, []);

  return <div className="space-y-3 rounded-2xl bg-muted/40 p-5">
    <label className="flex min-h-11 cursor-pointer items-start gap-3 font-semibold" htmlFor="privacy-metrics">
      <input id="privacy-metrics" type="checkbox" checked={enabled} disabled={!ready} onChange={event => {
        const next = event.target.checked;
        setMetricConsent(next);
        const saved = hasMetricConsent();
        setEnabled(saved);
        setMessage(saved === next ? next ? "Métricas opcionais ativadas neste navegador." : "Métricas opcionais desativadas. A limpeza dos cookies de contagem foi solicitada; cookies remanescentes expiram em até uma hora." : "Não foi possível guardar sua escolha. Verifique as configurações de cookies do navegador.");
      }} aria-describedby="privacy-metrics-help" className="mt-1 size-5 shrink-0 accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
      Permitir métricas de eventos
    </label>
    <p id="privacy-metrics-help" className="text-sm leading-6 text-muted-foreground">Opcional e desativado por padrão. Contamos visualizações e cliques em ingressos de forma agregada por evento e dia. Cookies de até uma hora evitam contagens repetidas; sua escolha fica neste navegador por até 180 dias. Recusar não impede o acesso aos eventos.</p>
    {message && <p role="status" className="text-sm leading-6">{message}</p>}
  </div>;
}
