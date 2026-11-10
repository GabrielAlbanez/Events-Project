"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const requestTypes = ["Acesso aos meus dados", "Correção de dados", "Exclusão de dados ou da conta", "Revogação de consentimento", "Informações sobre compartilhamento", "Outro pedido de privacidade"] as const;

export function PrivacyRequestForm({ contactEmail }: { contactEmail: string }) {
  const [requestType, setRequestType] = useState<string>(requestTypes[0]);
  const [details, setDetails] = useState("");
  const body = `Olá, responsável pelo EventMap.\n\nSolicitação: ${requestType}.\n\n${details.trim()}\n\nE-mail da minha conta (se houver):\n\nAguardo orientações para confirmação da minha identidade, se necessária.`;
  const href = `mailto:${contactEmail}?subject=${encodeURIComponent(`Privacidade EventMap — ${requestType}`)}&body=${encodeURIComponent(body)}`;

  return <div className="space-y-5">
    <div className="space-y-2">
      <Label htmlFor="privacy-request-type">O que você precisa?</Label>
      <select id="privacy-request-type" value={requestType} onChange={event => setRequestType(event.target.value)} className="flex min-h-12 w-full rounded-xl border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {requestTypes.map(type => <option key={type} value={type}>{type}</option>)}
      </select>
    </div>
    <div className="space-y-2">
      <Label htmlFor="privacy-request-details">Descreva seu pedido (opcional)</Label>
      <Textarea id="privacy-request-details" value={details} onChange={event => setDetails(event.target.value)} maxLength={1500} rows={5} aria-describedby="privacy-request-help" placeholder="Conte somente o necessário para entendermos sua solicitação." className="resize-y" />
      <p id="privacy-request-help" className="text-sm leading-6 text-muted-foreground">Não envie senha, documento de identidade, dados de saúde ou mensagens de outras pessoas. Este texto fica nesta página até você abrir o aplicativo de e-mail.</p>
    </div>
    <Button asChild className="min-h-12 rounded-xl"><a href={href}>Preparar e-mail de solicitação</a></Button>
    <p className="text-sm leading-6 text-muted-foreground">O botão abre seu aplicativo de e-mail. Confira o conteúdo e envie por lá; clicar aqui não envia nem registra um pedido. Se o aplicativo não abrir, escreva diretamente para <a href={`mailto:${contactEmail}`} className="break-all font-medium text-primary underline underline-offset-4">{contactEmail}</a>.</p>
  </div>;
}
