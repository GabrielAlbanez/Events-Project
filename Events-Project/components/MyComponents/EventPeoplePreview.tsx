"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowUpRight, Users } from "lucide-react";
import type { PartyConnectionsSnapshot } from "@/types/partyConnections";
import PartyAvatar from "./PartyAvatar";

const action = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50";

export default function EventPeoplePreview({ eventId }: { eventId: string }) {
  const { status, data: session } = useSession();
  return <PeoplePreview key={`${eventId}:${status}:${session?.user?.id ?? "guest"}`} eventId={eventId} status={status} />;
}

function PeoplePreview({ eventId, status }: { eventId: string; status: "loading" | "authenticated" | "unauthenticated" }) {
  const id = useId();
  const request = useRef<AbortController | null>(null);
  const active = useRef(true);
  const [opened, setOpened] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PartyConnectionsSnapshot | null>(null);
  const [error, setError] = useState("");
  const connections = `/eventos/${encodeURIComponent(eventId)}/conexoes`;
  useEffect(() => { active.current = true; return () => { active.current = false; request.current?.abort(); }; }, []);

  async function load() {
    if (loading || status !== "authenticated") return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setOpened(true);
    setLoading(true);
    setError("");
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`/api/party-connections/${encodeURIComponent(eventId)}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Não foi possível consultar as conexões. Tente novamente.");
      const snapshot = await response.json() as PartyConnectionsSnapshot;
      if (active.current && request.current === controller) setData(snapshot);
    } catch {
      if (active.current && request.current === controller) setError("Não foi possível consultar as conexões. Tente novamente.");
    } finally {
      clearTimeout(timeout);
      if (active.current && request.current === controller) setLoading(false);
    }
  }

  return <section aria-labelledby={`${id}-title`} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
    <div className="flex items-start gap-3"><Users aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /><div className="min-w-0"><h2 id={`${id}-title`} className="font-semibold">Quem também vai?</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Conheça participantes que escolheram aparecer nas conexões deste evento.</p></div></div>
    {status === "unauthenticated" ? <Link href="/login" className={`${action} mt-4`}>Entre para conhecer participantes</Link> : <button type="button" disabled={status === "loading" || loading} aria-expanded={opened} aria-controls={`${id}-people`} onClick={() => void load()} className={`${action} mt-4`}>{loading ? "Consultando conexões…" : opened ? "Atualizar participantes" : "Ver participantes"}</button>}
    {opened && <div id={`${id}-people`} aria-busy={loading} className="mt-4 space-y-3">
      {loading ? <p role="status" className="text-sm text-muted-foreground">Buscando perfis disponíveis…</p> : error ? <div><p role="alert" className="text-sm text-destructive">{error}</p><button type="button" onClick={() => void load()} className={`${action} mt-3`}>Tentar novamente</button></div> : data && !data.eligible ? <p className="text-sm leading-relaxed text-muted-foreground">Confirme sua presença neste evento para conhecer outros participantes. Se estiver na lista de espera, aguarde a confirmação da vaga.</p> : data && !data.mine?.active ? <div><p className="text-sm leading-relaxed text-muted-foreground">Você decide participar: crie ou ative seu perfil nas conexões para ver outras pessoas e escolher como aparecer.</p><Link href={connections} className={`${action} mt-3 text-primary`}>Configurar meu perfil <ArrowUpRight aria-hidden="true" className="size-4" /></Link></div> : data && <>
        {data.profiles.length > 0 ? <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">{data.profiles.slice(0, 6).map(profile => <li key={profile.userId} className="flex min-w-0 flex-col items-center gap-2 rounded-xl bg-muted/40 p-3 text-center"><span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10 font-semibold text-primary"><PartyAvatar key={profile.photoUrl} url={profile.photoUrl} name={profile.displayName} decorative /></span><span className="w-full break-words text-sm font-medium">{profile.displayName}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">Ainda não há novos perfis disponíveis para você neste evento. Suas conexões existentes continuam na área de conexões.</p>}
        <Link href={connections} className={`${action} w-full text-primary`}>Explorar conexões <ArrowUpRight aria-hidden="true" className="size-4" /></Link>
      </>}
    </div>}
  </section>;
}
