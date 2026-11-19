"use client";

import { useState } from "react";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OrganizerRequestForm } from "./OrganizerRequestForm";

/** Profile card for BASIC accounts: the self-service entry to become an organizer. */
export function OrganizerAccessCard() {
  const [open, setOpen] = useState(false);
  return <Card className="rounded-2xl border-brand/25 shadow-surface">
    <CardContent className="p-5 sm:p-7">
      <div className="flex items-start gap-3"><Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" /><div><h2 className="text-xl font-semibold">Quero publicar eventos</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Organiza festas, shows, cursos ou encontros? Peça acesso de organizador para publicar no mapa, receber inscrições e fazer check-in. <Link href="/para-organizadores" className="rounded-sm font-medium text-brand underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Saiba mais</Link>.</p></div></div>
      {open ? <div className="mt-5 border-t border-border pt-5"><OrganizerRequestForm /></div> : <Button type="button" variant="cta" className="mt-4 min-h-11" onClick={() => setOpen(true)}>Pedir acesso de organizador</Button>}
    </CardContent>
  </Card>;
}
