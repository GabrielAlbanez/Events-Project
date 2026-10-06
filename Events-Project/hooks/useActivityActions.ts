"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

export type ActivityQuickAction = {
  eventId: string;
  id: string;
  action: "queue.leave" | "task.update";
  status?: "DONE" | "HELP";
};

const validId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Send once through the existing event API; HTTP snapshots remain authoritative. */
export function useActivityActions(identity: string, refresh: () => Promise<void>) {
  const { status } = useSession();
  const [feedback, setFeedback] = useState({ identity, busy: false, message: "", error: "" });
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const request = useRef<AbortController | null>(null);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    setFeedback({ identity, busy: false, message: "", error: "" });
    return () => { active.current = false; request.current?.abort(); request.current = null; };
  }, [identity]);

  function clearFeedback() {
    if (currentIdentity.current === identity) setFeedback(value => ({ ...value, message: "", error: "" }));
  }

  async function run(action: ActivityQuickAction): Promise<boolean> {
    if (!active.current || currentIdentity.current !== identity || request.current) return false;
    if (status !== "authenticated" || !navigator.onLine) {
      setFeedback({ identity, busy: false, message: "", error: status !== "authenticated" ? "Entre para atualizar suas atividades." : "Você está sem rede. Aguarde a conexão voltar." });
      return false;
    }
    if (!validId(action.eventId) || !validId(action.id) || !["queue.leave", "task.update"].includes(action.action) || (action.action === "task.update" && !["DONE", "HELP"].includes(action.status ?? ""))) {
      setFeedback({ identity, busy: false, message: "", error: "Atualize a central antes de tentar novamente." });
      return false;
    }

    const controller = new AbortController();
    request.current = controller;
    setFeedback({ identity, busy: true, message: "", error: "" });
    const timeout = setTimeout(() => controller.abort(), 30000);
    const current = () => active.current && currentIdentity.current === identity && request.current === controller;
    try {
      const payload = action.action === "queue.leave" ? { action: action.action, id: action.id } : { action: action.action, id: action.id, status: action.status };
      const response = await fetch(`/api/community/events/${encodeURIComponent(action.eventId)}`, {
        method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const result = await response.json() as { message?: unknown };
      if (!current() || controller.signal.aborted) return false;
      if (!response.ok) {
        if ([401, 403, 404].includes(response.status)) await refresh();
        throw new Error(typeof result.message === "string" ? result.message : "Não foi possível salvar a alteração.");
      }
      clearTimeout(timeout);
      const message = action.action === "queue.leave" ? "Você saiu da fila." : action.status === "HELP" ? "Pedido de ajuda enviado à equipe." : "Tarefa concluída.";
      setFeedback({ identity, busy: true, message, error: "" });
      try { await refresh(); }
      catch { if (current()) setFeedback({ identity, busy: true, message, error: "A alteração foi salva, mas a central não foi atualizada. Tente sincronizar novamente." }); }
      return current();
    } catch (cause) {
      if (current()) setFeedback({ identity, busy: true, message: "", error: controller.signal.aborted || cause instanceof TypeError || cause instanceof SyntaxError
        ? "Não foi possível confirmar o envio. Confira a atividade antes de tentar novamente."
        : cause instanceof Error ? cause.message : "Não foi possível atualizar a atividade." });
      return false;
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        if (active.current && currentIdentity.current === identity) setFeedback(value => ({ ...value, busy: false }));
      }
    }
  }

  const visible = feedback.identity === identity ? feedback : { busy: false, message: "", error: "" };
  return { busy: visible.busy, message: visible.message, error: visible.error, run, clearFeedback };
}
