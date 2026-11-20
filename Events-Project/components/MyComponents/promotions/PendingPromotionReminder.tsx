"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";
import { listMyPendingPromotions } from "@/app/(actions)/promotions/action";
import type { PromotionPendingItem } from "@/lib/services/promotions";
import { formatPromotionAmount, formatPromotionDate } from "@/lib/promotions";

/** Calm reminder on "Meus eventos" for highlight orders whose organizer has not clicked "Já paguei" yet. */
export default function PendingPromotionReminder({ userId }: { userId: string }) {
  const [items, setItems] = useState<PromotionPendingItem[]>([]);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current;
    try {
      const result = await listMyPendingPromotions();
      if (id !== request.current) return;
      if (!result.success) { setFailed(true); return; }
      setItems(result.data); setFailed(false);
    } catch {
      if (id === request.current) setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    // Returning from the banking app is the moment the organizer most likely paid.
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load, userId]);

  if (failed) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Não foi possível verificar seus pedidos de destaque agora.{" "}
        <button type="button" onClick={() => void load()} className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Tentar novamente</button>
      </p>
    );
  }
  if (!items.length) return null;

  const single = items.length === 1;
  return (
    <section aria-labelledby="pending-promotion-title" className="rounded-2xl border border-amber-300/60 bg-amber-50 p-5 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"><Clock3 className="size-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <h2 id="pending-promotion-title" className="text-lg font-semibold">
            {single ? "Você tem um pedido de destaque aguardando pagamento" : `Você tem ${items.length} pedidos de destaque aguardando pagamento`}
          </h2>
          <p className="mt-1 text-sm leading-6 opacity-90">Já fez o Pix? Abra o pedido e clique em &ldquo;Já paguei&rdquo; para enviarmos para conferência.</p>
          <ul className="mt-3 divide-y divide-amber-300/50 dark:divide-amber-500/20">
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium">{item.event.nome}</p>
                  <p className="text-xs opacity-80"><span className="font-mono">{item.code}</span> · {item.days} dias · {formatPromotionAmount(item.amountCents)} · criado em {formatPromotionDate(item.createdAt)}</p>
                </div>
                <Link href={`/myEvents/${encodeURIComponent(item.event.id)}/destaque`} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-amber-900 underline underline-offset-4 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-100 dark:hover:text-amber-50">
                  Abrir pedido<span className="sr-only"> de {item.event.nome}</span><ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
