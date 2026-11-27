"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { authPathWithReturn } from "@/lib/authReturn";
import type { OrganizerInterest } from "@/lib/organizer/schema";
import { OrganizerActivationForm } from "./OrganizerActivationForm";
import { OrganizerRequestForm } from "./OrganizerRequestForm";

/** Chooses the right next step for the visitor: create an account, activate organizer access, join the plans list or start publishing. */
export function OrganizerRequestPanel({ interest = "access", returnTo = "/para-organizadores" }: { interest?: OrganizerInterest; returnTo?: string }) {
  const { data: session, status } = useSession();
  const role = session?.user?.role;

  if (status === "loading") return <p role="status" className="text-sm text-muted-foreground">Carregando sua conta...</p>;
  if (status !== "authenticated" || !session?.user?.id) {
    return <div className="space-y-3"><p className="text-sm leading-6 text-muted-foreground">{interest === "plans" ? "Crie uma conta gratuita ou entre para registrar seu interesse nos planos." : "Crie uma conta gratuita ou entre para ativar o acesso de organizador."}</p><div className="flex flex-col gap-3 sm:flex-row"><Button asChild variant="cta"><Link href={authPathWithReturn("/register", returnTo)}>Criar conta gratuita</Link></Button><Button asChild variant="outline"><Link href={authPathWithReturn("/login", returnTo)}>Já tenho conta</Link></Button></div></div>;
  }
  if (role === "ADMIN") return <p className="text-sm leading-6 text-muted-foreground">Você está com uma conta de administrador. Os pedidos de organizadores chegam na sua central de notificações.</p>;
  if (role === "PROMOTER" && interest === "access") {
    return <div className="space-y-3"><p className="text-sm leading-6 text-muted-foreground">Sua conta já pode publicar eventos.</p><Button asChild variant="cta"><Link href="/CriarEvento">Criar evento</Link></Button></div>;
  }
  if (interest === "access" && role === "BASIC") return <OrganizerActivationForm />;
  return <OrganizerRequestForm interest={interest} />;
}
