"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useGlobalConnectionsProfile } from "@/hooks/useGlobalConnectionsProfile";
import PartyProfileForm from "./PartyProfileForm";
import { partyButton } from "./PartyActions";

export default function GlobalConnectionsProfile() {
  const { data: session, status } = useSession();
  return <ProfileEditor key={`${status}:${session?.user?.id ?? "guest"}:${session?.user?.role ?? ""}`} />;
}
function ProfileEditor() {
  const resource = useGlobalConnectionsProfile();
  return <main className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-10"><div className="mx-auto max-w-3xl space-y-6"><header className="flex items-start gap-3"><SidebarTrigger className="size-11 shrink-0" /><div><Link href="/Profile" className={`${partyButton} -ml-4 text-muted-foreground`}>← Minha conta</Link><p className="mt-3 text-xs font-bold uppercase tracking-[.2em] text-primary">Conexões</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Um perfil para seus encontros.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Prepare seu perfil uma vez. Você escolhe em quais eventos quer aparecer para outras pessoas.</p></div></header><div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Você pode editar mesmo sem estar inscrito em um evento.</p><button type="button" className={`${partyButton} border`} disabled={resource.loading || resource.refreshing || resource.busy || !resource.online} onClick={() => void resource.refresh()}>Atualizar</button></div>{resource.error && <p role="alert" className="rounded-xl border p-4 text-sm">{resource.error}</p>}{resource.saveError && <p role="alert" className="rounded-xl border bg-muted/30 p-4 text-sm">{resource.saveError}</p>}{!resource.online && <p role="status" className="text-sm text-muted-foreground">Sem conexão. Seus ajustes ficam nesta tela; reconecte para salvar.</p>}{resource.loading ? <p role="status" className="rounded-3xl border p-7 text-muted-foreground">Carregando seu perfil de conexões…</p> : resource.data ? <PartyProfileForm global key={resource.identity} profile={resource.data.profile} needsReview={resource.data.needsReview} busy={resource.busy} eligible={resource.authenticated && resource.online} act={resource.save} /> : <p className="rounded-3xl border p-7 text-sm text-muted-foreground">Não foi possível abrir o perfil. Use Atualizar para tentar novamente.</p>}</div></main>;
}
