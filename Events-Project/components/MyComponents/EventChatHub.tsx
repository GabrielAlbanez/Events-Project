"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { LazyMotion, useReducedMotion } from "framer-motion";
import { loadAnimationFeatures } from "@/components/animations/config";
import { useSession } from "next-auth/react";
import { ArrowDown, ArrowLeft, ChevronUp, Loader2, ShieldCheck, X } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useEventChat } from "@/hooks/useEventChat";
import { useEventChatRealtime } from "@/hooks/useEventChatRealtime";
import { ChatHeader } from "./chat/ChatHeader";
import { ChatList, type ChatListItem } from "./chat/ChatList";
import { MessageList } from "./chat/MessageList";
import { MessageInput } from "./chat/MessageInput";
import styles from "./chat/Chat.module.css";

const action = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export default function EventChatHub({ eventId }: { eventId: string }) {
  const { data: session, status } = useSession();
  return <EventChatContent key={`${eventId}:${status}:${session?.user?.id ?? "guest"}:${session?.user?.role ?? ""}`} eventId={eventId} />;
}

function EventChatContent({ eventId }: { eventId: string }) {
  const chat = useEventChat(eventId);
  const realtime = useEventChatRealtime(eventId, chat.refresh, chat.revoke);
  return <EventChatView eventId={eventId} chat={chat} realtime={realtime} />;
}

export function EventChatView({ eventId, chat, realtime, privateMode = false, conversations, selectedConversation, conversationsLoading, partnerOnline }: { eventId: string; chat: ReturnType<typeof useEventChat>; realtime: string; privateMode?: boolean; conversations?: ChatListItem[]; selectedConversation?: string; conversationsLoading?: boolean; partnerOnline?: boolean | null }) {
  const [conversationOpen, setConversationOpen] = useState(true);
  const reduced = useReducedMotion();
  const { typing, acknowledge } = chat;
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<{ file: File; preview: string; uploaded?: { id: string; url: string } } | null>(null);
  const [attachmentError, setAttachmentError] = useState("");
  const attachmentInput = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const draftRevision = useRef(0);
  const submittedDraft = useRef<{ text: string; attachment: typeof attachment; revision: number } | null>(null);
  const currentChat = useRef(chat); currentChat.current = chat;
  const restoreDraft = useCallback(() => {
    const submitted = submittedDraft.current;
    if (!submitted) return;
    if (!currentChat.current.denied && draftRevision.current === submitted.revision) {
      setDraft(value => value === "" ? submitted.text : value);
      if (submitted.attachment) {
        const restored = { ...submitted.attachment, preview: URL.createObjectURL(submitted.attachment.file) };
        setAttachment(value => { if (value) { URL.revokeObjectURL(restored.preview); return value; } return restored; });
      }
    }
    submittedDraft.current = null;
  }, []);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTyping = useCallback(() => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = null;
    typing(false);
  }, [typing]);
  const changeDraft = (value: string) => {
    draftRevision.current++;
    setDraft(value);
    if (!privateMode || !value.trim()) { stopTyping(); return; }
    typing(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(stopTyping, 3000);
  };
  useEffect(() => () => stopTyping(), [stopTyping]);
  const attachmentPreview = attachment?.preview;
  useEffect(() => () => { if (attachmentPreview) URL.revokeObjectURL(attachmentPreview); }, [attachmentPreview]);
  useEffect(() => { if (chat.denied) { setAttachment(null); setAttachmentError(""); } }, [chat.denied]);
  const chooseImage = (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type) || file.size === 0 || file.size > 5 * 1024 * 1024) {
      setAttachmentError("Escolha uma foto JPEG, PNG, WebP ou AVIF válida de até 5 MB."); return;
    }
    setAttachmentError(""); setAttachment({ file, preview: URL.createObjectURL(file) });
  };
  const [typingVisible, setTypingVisible] = useState(false);
  const newestIncoming = chat.messages.filter(message => !message.own).at(-1)?.id;
  useEffect(() => {
    const until = chat.partnerReceipt?.typingUntil;
    const remaining = until ? new Date(until).getTime() - Date.now() : 0;
    setTypingVisible(privateMode && remaining > 0);
    if (remaining <= 0) return;
    const timer = setTimeout(() => setTypingVisible(false), remaining);
    return () => clearTimeout(timer);
  }, [chat.partnerReceipt?.typingUntil, privateMode]);

  const [unread, setUnread] = useState(0);
  useEffect(() => { if (chat.denied) { setDraft(""); setUnread(0); } }, [chat.denied]);
  const viewport = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const scrollIntent = useRef(0);
  const noteScrollIntent = () => { scrollIntent.current = Date.now(); };
  const incomingVisible = useCallback(() => {
    const container = viewport.current;
    const bubble = container?.querySelector(`[data-message-id="${newestIncoming}"]`);
    if (!container || !bubble || document.visibilityState !== "visible") return false;
    const bounds = bubble.getBoundingClientRect(), frame = container.getBoundingClientRect();
    return bounds.bottom > Math.max(0, frame.top) && bounds.top < Math.min(window.innerHeight, frame.bottom);
  }, [newestIncoming]);
  const lastMessage = useRef<number | null>(null);
  const firstMessage = useRef<number | null>(null);
  const anchor = useRef<{ height: number; top: number } | null>(null);
  const pending = useRef(chat.pending);
  useEffect(() => {
    const previous = pending.current;
    if (previous && !chat.pending) {
      if (chat.messages.some(message => message.own && message.clientId === previous.clientId) || chat.denied) submittedDraft.current = null;
      else restoreDraft();
    }
    pending.current = chat.pending;
  }, [chat.pending, chat.messages, chat.denied, restoreDraft]);
  const visibleMessages = chat.optimisticMessage ? [...chat.messages, chat.optimisticMessage] : chat.messages;
  const optimisticClientId = chat.optimisticMessage?.clientId;
  useEffect(() => {
    if (optimisticClientId && following.current && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [optimisticClientId]);
  useEffect(() => {
    const element = viewport.current;
    const newest = chat.messages.at(-1)?.id ?? null;
    const oldest = chat.messages[0]?.id ?? null;
    if (!element) return;
    if (anchor.current && oldest !== firstMessage.current) {
      element.scrollTop = anchor.current.top + element.scrollHeight - anchor.current.height;
      anchor.current = null;
    } else if (newest !== lastMessage.current) {
      if (following.current || lastMessage.current === null) { scrollIntent.current = 0; element.scrollTop = element.scrollHeight; }
      else setUnread(previous => previous + chat.messages.filter(message => message.id > (lastMessage.current ?? 0)).length);
    }
    if (!chat.loadingOlder && oldest === firstMessage.current) anchor.current = null;
    lastMessage.current = newest; firstMessage.current = oldest;
  }, [chat.messages, chat.loadingOlder]);
  useEffect(() => {
    if (!privateMode || !newestIncoming) return;
    const markReceipt = () => { acknowledge(newestIncoming, false); if (following.current && incomingVisible()) acknowledge(newestIncoming, true); };
    markReceipt();
    const observer = new IntersectionObserver(() => { if (following.current && incomingVisible()) markReceipt(); }, { threshold: .5 });
    const bubble = viewport.current?.querySelector(`[data-message-id="${newestIncoming}"]`);
    if (bubble) observer.observe(bubble);
    document.addEventListener("visibilitychange", markReceipt);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", markReceipt); };
  }, [newestIncoming, privateMode, acknowledge, incomingVisible]);
  const messageCount = visibleMessages.length;
  const bottom = useCallback(() => { scrollIntent.current = 0; if (viewport.current) { if (viewport.current.scrollTo && !reduced && messageCount <= 200) viewport.current.scrollTo({ top: viewport.current.scrollHeight, behavior: "smooth" }); else viewport.current.scrollTop = viewport.current.scrollHeight; } following.current = true; setUnread(0); if (privateMode && newestIncoming && incomingVisible()) acknowledge(newestIncoming, true); }, [reduced, privateMode, newestIncoming, incomingVisible, acknowledge, messageCount]);
  const imageLoaded = useCallback(() => { if (following.current) bottom(); }, [bottom]);
  const rangeRendered = useCallback(() => { if (privateMode && newestIncoming && following.current && incomingVisible()) acknowledge(newestIncoming, true); }, [privateMode, newestIncoming, incomingVisible, acknowledge]);
  const older = async () => {
    if (viewport.current) anchor.current = { height: viewport.current.scrollHeight, top: viewport.current.scrollTop };
    await chat.loadOlder();
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current || chat.sending || chat.imageUploading || chat.pending || chat.loading || !chat.online || (!draft.trim() && !attachment)) return;
    submitting.current = true; stopTyping(); const submitted = draft; const selected = attachment; const revision = draftRevision.current;
    try {
      let image = selected?.uploaded;
      if (selected && !image) {
        image = await chat.uploadImage(selected.file);
        const uploaded = image;
        setAttachment(previous => previous?.file === selected.file ? { ...previous, uploaded } : previous);
      }
      submittedDraft.current = { text: submitted, attachment: selected && image ? { ...selected, uploaded: image } : selected, revision };
      scrollIntent.current = 0; following.current = true;
      setDraft(previous => previous === submitted ? "" : previous); setAttachment(null);
      if (await chat.send(submitted, false, image?.id)) submittedDraft.current = null;
      else if (!currentChat.current.pending && !currentChat.current.sending) restoreDraft();
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "Não foi possível enviar a foto. Tente novamente.");
    } finally { submitting.current = false; }
  };
  const pendingMessage = chat.pending;
  const sendMessage = chat.send;
  const retry = useCallback(async () => {
    if (pendingMessage && await sendMessage(pendingMessage.text, true)) submittedDraft.current = null;
  }, [pendingMessage, sendMessage]);
  const statusLabel = !chat.online ? "Sem conexão" : realtime === "live" ? "Conectado ao chat" : realtime === "connecting" ? "Conectando" : realtime === "denied" ? "Acesso indisponível" : "Sincronizando pelo histórico";
  const peerStatus = privateMode && partnerOnline !== undefined && partnerOnline !== null ? partnerOnline ? "online" : "offline" : statusLabel;

  const items = conversations ?? [{ id: eventId, name: chat.event?.name ?? "Chat do evento", href: `/eventos/${encodeURIComponent(eventId)}/chat`, preview: chat.messages.at(-1)?.text || "Converse com os participantes" }];

  return <LazyMotion features={loadAnimationFeatures} strict><main className={styles.page}>

    <div className={styles.toolbar}><SidebarTrigger /><Link href={`/eventos/${encodeURIComponent(eventId)}${privateMode ? "/conexoes" : ""}`} className="inline-flex items-center gap-2"><ArrowLeft size={15} aria-hidden="true" />{privateMode ? "Conexões da festa" : "Voltar ao evento"}</Link></div>

    <section className={`${styles.shell} ${conversationOpen ? styles.conversationOpen : styles.listOpen}`} aria-label="Chat">

      <ChatList items={items} selected={selectedConversation ?? eventId} onSelect={() => setConversationOpen(true)} loading={conversationsLoading} />

      <section className={styles.conversation} aria-label="Conversa dos participantes">

        <ChatHeader name={chat.event?.name ?? (privateMode ? "Conversa privada" : "Chat do evento")} image={chat.event?.partnerImage} status={peerStatus} typing={typingVisible} refresh={() => void chat.refresh()} disabled={!chat.online || chat.loading || chat.denied} back={() => setConversationOpen(false)} />

        {chat.error && <p role="alert" className={styles.notice}>{chat.error}</p>}

        {!chat.online && <p role="status" className={styles.notice}>Sem conexão. Você pode escrever e enviar ao reconectar.</p>}

        <div ref={viewport} tabIndex={0} aria-label="Histórico de mensagens" onWheel={noteScrollIntent} onTouchMove={noteScrollIntent} onPointerDown={noteScrollIntent} onKeyDown={event => { if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) noteScrollIntent(); }} onScroll={() => { const element = viewport.current; if (element) { if (Date.now() - scrollIntent.current < 1500) following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 90; if (following.current) { setUnread(0); if (privateMode && newestIncoming && incomingVisible()) acknowledge(newestIncoming, true); } } }} className={styles.history}>

          {chat.nextBefore !== null && !chat.denied && <div className="mb-5 text-center"><button type="button" disabled={chat.loadingOlder || !chat.online} onClick={() => void older()} className={`${action} border bg-background`}>{chat.loadingOlder ? <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ChevronUp size={15} aria-hidden="true" />}Mensagens anteriores</button></div>}

          {chat.loading ? <p role="status" className={styles.empty}>Buscando sua conversa…</p> : chat.denied ? <div className={styles.empty}><ShieldCheck className="mx-auto mb-3 size-8" /><p>Confirme sua participação para acessar esta conversa.</p><Link href={`/eventos/${encodeURIComponent(eventId)}`} className={action}>Ver minha participação</Link></div> : visibleMessages.length === 0 ? <div className={styles.empty}><h2 className="mb-2 text-lg font-semibold">Dê o primeiro oi</h2><p>As melhores conexões começam com uma conversa.</p></div> : <MessageList messages={visibleMessages} viewport={viewport} following={following} privateMode={privateMode} deliveredThrough={chat.partnerReceipt?.deliveredThrough ?? 0} readThrough={chat.partnerReceipt?.readThrough ?? 0} failed={chat.retryStopped} retry={retry} onImageLoad={imageLoaded} onRangeRendered={rangeRendered} />}

        </div>

        {unread > 0 && !chat.denied && <button type="button" onClick={bottom} className={styles.jump}><ArrowDown size={18} aria-hidden="true" />{unread} {unread === 1 ? "nova mensagem" : "novas mensagens"}</button>}

        {!chat.denied && <MessageInput value={draft} onChange={changeDraft} onBlur={stopTyping} onSubmit={submit} disabled={!chat.online || chat.sending || chat.imageUploading || chat.loading || !!chat.pending} hasAttachment={!!attachment} uploading={chat.imageUploading} attach={privateMode ? () => { setAttachmentError(""); attachmentInput.current?.click(); } : undefined}>

          {privateMode && <><input ref={attachmentInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" tabIndex={-1} aria-label="Selecionar foto para enviar" onChange={event => { chooseImage(event.target.files?.[0]); event.currentTarget.value = ""; }} />{attachment && <div className="mb-2 flex items-start gap-3 rounded-xl border p-3"><img src={attachment.preview} alt="Prévia da foto anexada" className="h-24 w-24 rounded-lg object-contain" /><div className="min-w-0 flex-1"><p className="break-words text-xs font-medium">{attachment.file.name}</p><p className="mt-1 text-xs">Pronta para enviar · até 5 MB</p></div><button type="button" aria-label="Remover foto anexada" disabled={chat.sending || chat.imageUploading || !!chat.pending} onClick={() => setAttachment(null)} className={styles.iconButton}><X size={16} aria-hidden="true" /></button></div>}{attachmentError && <p role="alert" className="mb-2 text-sm text-destructive">{attachmentError}</p>}</>}

          {chat.imageUploading && <p role="status" className="flex items-center gap-2 text-xs"><Loader2 size={14} className="animate-spin motion-reduce:animate-none" />Enviando foto…</p>}

          {chat.pending && !chat.sending && <aside className={styles.notice}><p>{chat.retryStopped ? "Não foi possível confirmar o envio. Sua mensagem está preservada." : "Tentaremos novamente automaticamente, sem duplicar a mensagem."}</p><button type="button" disabled={!chat.online} onClick={() => void retry()} className="min-h-10 underline">Tentar agora</button></aside>}

        </MessageInput>}

        <p className={styles.privacy}>{privateMode ? "Conversa privada entre os dois participantes. Não compartilhe dados sensíveis." : "Chat dos participantes confirmados e da equipe do evento."}</p>

      </section>

    </section>

  </main></LazyMotion>;

}
