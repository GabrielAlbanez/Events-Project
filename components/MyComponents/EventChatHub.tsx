"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowDown, ArrowLeft, Check, ChevronUp, Loader2, MessageCircle, RefreshCw, Send, ShieldCheck, WifiOff } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { FadeInView } from "@/components/animations/FadeInView";
import { useEventChat } from "@/hooks/useEventChat";
import { useEventChatRealtime } from "@/hooks/useEventChatRealtime";

const action = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
function time(value: string) { return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function day(value: string) { return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" }).format(new Date(value)); }

export default function EventChatHub({ eventId }: { eventId: string }) {
  const { data: session, status } = useSession();
  return <EventChatContent key={`${eventId}:${status}:${session?.user?.id ?? "guest"}:${session?.user?.role ?? ""}`} eventId={eventId} />;
}

function EventChatContent({ eventId }: { eventId: string }) {
  const chat = useEventChat(eventId);
  const realtime = useEventChatRealtime(eventId, chat.refresh, chat.revoke);
  return <EventChatView eventId={eventId} chat={chat} realtime={realtime} />;
}

export function EventChatView({ eventId, chat, realtime, privateMode = false }: { eventId: string; chat: ReturnType<typeof useEventChat>; realtime: string; privateMode?: boolean }) {
  const [draft, setDraft] = useState("");
  const [unread, setUnread] = useState(0);
  useEffect(() => { if (chat.denied) { setDraft(""); setUnread(0); } }, [chat.denied]);
  const viewport = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const lastMessage = useRef<number | null>(null);
  const firstMessage = useRef<number | null>(null);
  const anchor = useRef<{ height: number; top: number } | null>(null);
  const pending = useRef(chat.pending);
  useEffect(() => {
    const previous = pending.current;
    if (previous && !chat.pending && chat.messages.some(message => message.own && message.clientId === previous.clientId)) setDraft(value => value.trim() === previous.text ? "" : value);
    pending.current = chat.pending;
  }, [chat.pending, chat.messages]);
  useEffect(() => {
    const element = viewport.current;
    const newest = chat.messages.at(-1)?.id ?? null;
    const oldest = chat.messages[0]?.id ?? null;
    if (!element) return;
    if (anchor.current && oldest !== firstMessage.current) {
      element.scrollTop = anchor.current.top + element.scrollHeight - anchor.current.height;
      anchor.current = null;
    } else if (newest !== lastMessage.current) {
      if (following.current || lastMessage.current === null) element.scrollTop = element.scrollHeight;
      else setUnread(previous => previous + chat.messages.filter(message => message.id > (lastMessage.current ?? 0)).length);
    }
    if (!chat.loadingOlder && oldest === firstMessage.current) anchor.current = null;
    lastMessage.current = newest; firstMessage.current = oldest;
  }, [chat.messages, chat.loadingOlder]);
  const bottom = () => { if (viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight; following.current = true; setUnread(0); };
  const older = async () => {
    if (viewport.current) anchor.current = { height: viewport.current.scrollHeight, top: viewport.current.scrollTop };
    await chat.loadOlder();
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const submitted = draft;
    if (await chat.send(submitted)) { setDraft(previous => previous === submitted ? "" : previous); bottom(); }
  };
  const retry = async () => {
    const submitted = chat.pending?.text;
    if (submitted && await chat.send(submitted, true)) { setDraft(previous => previous.trim() === submitted ? "" : previous); bottom(); }
  };
  const statusLabel = !chat.online ? "Sem conexão" : realtime === "live" ? "Conectado ao chat" : realtime === "connecting" ? "Conectando" : realtime === "denied" ? "Acesso indisponível" : "Sincronizando pelo histórico";
  return <main className="w-full min-w-0 px-4 py-5 sm:px-6 lg:px-10"><div className="mx-auto max-w-6xl space-y-5">
    <FadeInView><header className="flex items-start gap-3"><SidebarTrigger /><div className="min-w-0 flex-1"><Link href={`/eventos/${encodeURIComponent(eventId)}${privateMode ? "/conexoes" : ""}`} className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary"><ArrowLeft size={15} aria-hidden="true" />{privateMode ? "Voltar às conexões" : "Voltar ao evento"}</Link><p className="mt-2 text-xs font-bold uppercase tracking-[.18em] text-primary">{privateMode ? "Uma conexão, uma conversa" : "Encontre sua turma"}</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{privateMode ? "Vocês combinaram." : "O encontro começa aqui."}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{privateMode ? "Converse no seu ritmo. O interesse é mútuo; o respeito também precisa ser." : "Converse com quem também vai, tire dúvidas e combine os detalhes da festa."}</p></div></header></FadeInView>
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
      <section aria-label="Conversa dos participantes" className="flex min-w-0 flex-col overflow-hidden rounded-3xl border bg-card shadow-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-primary/5 p-4 sm:p-5"><div className="flex min-w-0 items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground"><MessageCircle size={22} aria-hidden="true" /></span><div className="min-w-0"><h2 className="break-words font-semibold">{chat.event?.name ?? (privateMode ? "Conversa privada" : "Chat do evento")}</h2><p role="status" className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><span className={`size-2 rounded-full ${chat.online && realtime === "live" ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden="true" />{statusLabel}</p></div></div><button type="button" disabled={!chat.online || chat.loading || chat.denied} onClick={() => void chat.refresh()} className={`${action} border bg-background`}><RefreshCw size={15} aria-hidden="true" />Atualizar</button></div>
        {chat.error && <p role="alert" className="border-b border-amber-500/20 bg-amber-500/10 px-5 py-3 text-sm leading-6">{chat.error}</p>}
        {!chat.online && <p role="status" className="flex items-center gap-2 border-b px-5 py-3 text-sm text-muted-foreground"><WifiOff size={16} aria-hidden="true" />Você pode escrever enquanto está offline. Envie ao reconectar.</p>}
        <div ref={viewport} tabIndex={0} aria-label="Histórico de mensagens" onScroll={() => { const element = viewport.current; if (element) { following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 90; if (following.current) setUnread(0); } }} className="h-[48dvh] min-h-[280px] overflow-y-auto overscroll-contain bg-muted/15 px-4 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:h-[52dvh] sm:px-6">
          {chat.nextBefore !== null && !chat.denied && <div className="mb-5 text-center"><button type="button" disabled={chat.loadingOlder || !chat.online} onClick={() => void older()} className={`${action} border bg-background`}>{chat.loadingOlder ? <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ChevronUp size={15} aria-hidden="true" />}Mensagens anteriores</button></div>}
          {chat.loading ? <div role="status" className="grid min-h-64 place-content-center gap-3 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto animate-spin motion-reduce:animate-none" aria-hidden="true" />Buscando sua conversa…</div> : chat.denied ? <div className="grid min-h-64 place-content-center gap-4 text-center"><ShieldCheck className="mx-auto size-10 text-primary" aria-hidden="true" /><h3 className="text-lg font-semibold">Uma conversa para quem vai ao evento</h3><p className="max-w-sm text-sm leading-6 text-muted-foreground">Entre na sua conta e confirme sua participação para conversar com os participantes.</p><Link href={`/eventos/${encodeURIComponent(eventId)}`} className={`${action} bg-primary text-primary-foreground`}>Ver minha participação</Link></div> : chat.messages.length === 0 ? <div className="grid min-h-64 place-content-center gap-3 text-center"><span className="mx-auto grid size-16 place-items-center rounded-3xl bg-primary/10 text-primary"><MessageCircle size={30} aria-hidden="true" /></span><h3 className="text-lg font-semibold">Dê o primeiro oi</h3><p className="max-w-xs text-sm leading-6 text-muted-foreground">Apresente-se ou conte o que mais quer aproveitar no evento.</p></div> : <ol className="space-y-4">{chat.messages.map((message, index) => {
            const dateChanged = index === 0 || day(message.createdAt) !== day(chat.messages[index - 1].createdAt);
            return <li key={message.id}>{dateChanged && <p className="mb-5 text-center text-[11px] font-medium text-muted-foreground">{day(message.createdAt)}</p>}<div className={`flex items-end gap-2 ${message.own ? "flex-row-reverse" : ""}`}><span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold" aria-hidden="true">{message.author.name.slice(0, 1).toUpperCase()}</span><article className={`max-w-[85%] rounded-2xl px-4 py-3 sm:max-w-[78%] ${message.own ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border bg-background"}`}><p className={`mb-1 text-xs font-semibold ${message.own ? "text-primary-foreground/80" : "text-primary"}`}>{message.own ? "Você" : message.author.name}</p><p className="whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{message.text}</p><p className={`mt-2 flex items-center justify-end gap-1 text-[10px] ${message.own ? "text-primary-foreground/75" : "text-muted-foreground"}`}><time dateTime={message.createdAt}>{time(message.createdAt)}</time>{privateMode && <span aria-label={`Mensagem número ${message.id}`}>· #{message.id}</span>}{message.own && <><Check size={12} aria-hidden="true" /><span className="sr-only">Envio confirmado</span></>}</p></article></div></li>;
          })}</ol>}
        </div>
        {unread > 0 && !chat.denied && <button type="button" onClick={bottom} className="mx-4 my-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/5 text-sm font-semibold text-primary"><ArrowDown size={15} aria-hidden="true" />{unread} {unread === 1 ? "nova mensagem" : "novas mensagens"}</button>}
        {!chat.denied && <form onSubmit={submit} className="space-y-3 border-t bg-background p-4 sm:p-5"><label htmlFor="event-chat-message" className="block text-sm font-semibold">Sua mensagem</label><textarea id="event-chat-message" value={draft} onChange={event => setDraft(event.target.value)} rows={2} maxLength={1000} aria-describedby="event-chat-hint" placeholder="Quem mais está animado para o evento?" className="block max-h-40 min-h-20 w-full resize-y rounded-2xl border bg-muted/30 px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /><div className="flex flex-wrap items-center justify-between gap-3"><p id="event-chat-hint" className="text-xs text-muted-foreground">{draft.length}/1000 · Texto simples, sem dados pessoais</p><button type="submit" disabled={!chat.online || chat.sending || chat.loading || !!chat.pending || !draft.trim()} className={`${action} bg-primary text-primary-foreground`}>{chat.sending ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}Enviar mensagem</button></div>{chat.pending && !chat.sending && <aside className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3"><p className="text-xs leading-5">Existe um envio sem confirmação. O texto continua aqui; confira o histórico ou repita esse mesmo envio com segurança.</p><button type="button" disabled={!chat.online} onClick={() => void retry()} className={`${action} mt-2 border bg-background`}>Confirmar envio novamente</button></aside>}</form>}
      </section>
      <aside className="space-y-4"><div className="rounded-3xl border bg-card shadow-surface p-5"><ShieldCheck className="mb-4 size-7 text-primary" aria-hidden="true" /><h2 className="text-lg font-semibold">Mesmo evento, boas conexões</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">{privateMode ? "Esta conversa é privada entre vocês. Gestores não recebem acesso automático. Uma denúncia pode incluir a mensagem que você escolher como evidência." : "Este chat é compartilhado com os participantes confirmados, o organizador e administradores."}</p><ul className="mt-5 space-y-3 text-sm leading-6"><li>✦ Combine pontos de encontro públicos.</li><li>✦ Respeite quem está conversando.</li><li>✦ Não compartilhe telefone, ingresso ou informações sensíveis.</li></ul><p className="mt-4 border-t pt-4 text-xs leading-5 text-muted-foreground">As mensagens ficam no histórico. Este espaço conecta pessoas; não é um assistente de IA.</p></div><Link href={`/eventos/${encodeURIComponent(eventId)}/comunidade`} className="block rounded-3xl border bg-card p-5 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><p className="font-semibold">Tudo sobre a festa →</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Avisos oficiais, programação, filas e perguntas na comunidade.</p></Link></aside>
    </div>
  </div></main>;
}
