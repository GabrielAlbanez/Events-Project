"use client";

import { memo } from "react";
import { m, useReducedMotion } from "framer-motion";
import { AlertCircle, Check, CheckCheck, Clock3 } from "lucide-react";
import type { EventChatMessage } from "@/types/eventChat";
import { ChatAvatar, ChatMessageImage } from "../ChatAvatar";
import styles from "./Chat.module.css";

export function chatDate(value: string) {
  const date = new Date(value), today = new Date(), yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Hoje";
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" }).format(date);
}
export const MessageBubble = memo(function MessageBubble({ message, first, date, privateMode, deliveredThrough, readThrough, failed, retry, onImageLoad, windowKey }: { message: EventChatMessage; first: boolean; date?: string; privateMode: boolean; deliveredThrough: number; readThrough: number; failed: boolean; retry: () => void; onImageLoad: () => void; windowKey?: string }) {
  const reduced = useReducedMotion();
  const state = message.id < 0 ? failed ? "Falha no envio" : "Aguardando confirmação" : readThrough >= message.id && privateMode ? "Lida" : deliveredThrough >= message.id && privateMode ? "Entregue" : "Enviada";
  return <m.li data-window-key={windowKey} data-message-id={message.id > 0 ? message.id : undefined} initial={{ opacity: reduced || message.id < 0 ? 1 : .85, y: reduced || message.id < 0 ? 0 : 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .18 }} className={styles.messageRow}>{date && <div className={styles.date}><span>{date}</span></div>}<div className={`${styles.messageLine} ${message.own ? styles.ownLine : ""} ${first ? styles.sequenceStart : ""}`}><span className={first ? styles.authorAvatar : styles.avatarSpacer}>{first && <ChatAvatar name={message.author.name} image={message.author.image} className="size-7 text-xs" />}</span><article className={`${styles.bubble} ${message.own ? styles.ownBubble : styles.incomingBubble} ${first ? styles.tail : ""}`}>{!privateMode && !message.own && first && <p className={styles.author}>{message.author.name}</p>}{message.image && <ChatMessageImage url={message.image.url} onLoad={onImageLoad} />}{message.text && <p className={styles.messageText}>{message.text}</p>}<div className={styles.metadata}><time dateTime={message.createdAt}>{new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(message.createdAt))}</time>{message.own && <span aria-label={state} title={state} className={state === "Lida" ? styles.read : ""}>{message.id < 0 ? failed ? <button type="button" aria-label="Reenviar mensagem" className={styles.retry} onClick={retry}><AlertCircle size={14} /></button> : <Clock3 size={13} aria-hidden="true" /> : state === "Lida" || state === "Entregue" ? <CheckCheck size={16} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}<span className="sr-only">{state}</span></span>}</div></article></div></m.li>;
});
