"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { useCommunityResource } from "@/components/MyComponents/CommunityResource";
import type { PartySavedProfile } from "@/types/partyConnections";

export function useGlobalConnectionsProfile() {
  const resource = useCommunityResource<{ profile: PartySavedProfile | null; needsReview: boolean }>("/api/party-profile");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const locked = useRef(false);
  const active = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const currentIdentity = useRef(resource.identity);
  currentIdentity.current = resource.identity;
  useEffect(() => { active.current = true; setSaving(false); setSaveError(""); return () => { active.current = false; controller.current?.abort(); }; }, [resource.identity]);
  const save = async (payload: Record<string, unknown>): Promise<boolean> => {
    if (!active.current || currentIdentity.current !== resource.identity || locked.current || !resource.authenticated || !resource.online) return false;
    const identity = resource.identity;
    locked.current = true; setSaving(true); setSaveError("");
    const request = new AbortController(); controller.current = request;
    const timeout = setTimeout(() => request.abort(), 30000);
    try {
      const { action: _action, ...fields } = payload;
      const response = await fetch("/api/party-profile", { method: "PUT", signal: request.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) });
      const result: { message?: string } = await response.json();
      if (!response.ok) throw new Error(result.message || "Não foi possível salvar o perfil.");
      if (!active.current || currentIdentity.current !== identity || request.signal.aborted) return false;
      await resource.refresh();
      if (!active.current || currentIdentity.current !== identity || request.signal.aborted) return false;
      toast.success("Perfil atualizado.", { role: "status" });
      return true;
    } catch (cause) {
      if (active.current && currentIdentity.current === identity && !request.signal.aborted) setSaveError(cause instanceof Error && !(cause instanceof TypeError || cause instanceof SyntaxError) ? cause.message : "Não foi possível confirmar o envio. Atualize para conferir antes de tentar novamente.");
      return false;
    } finally {
      clearTimeout(timeout); locked.current = false;
      if (active.current && currentIdentity.current === identity) { setSaving(false); if (request.signal.aborted) setSaveError("O envio foi interrompido. Atualize para conferir se o perfil foi salvo antes de tentar novamente."); }
    }
  };
  return { ...resource, busy: resource.busy || saving, save, saveError };
}
