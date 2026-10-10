"use client";

import { ArrowLeft, RefreshCw } from "lucide-react";
import { ChatAvatar } from "../ChatAvatar";
import styles from "./Chat.module.css";

export function ChatHeader({ name, image, status, typing, refresh, disabled, back }: { name: string; image?: string | null; status: string; typing: boolean; refresh: () => void; disabled: boolean; back?: () => void }) {
  return <header className={styles.header}>{back && <button type="button" className={`${styles.iconButton} ${styles.mobileBack}`} aria-label="Voltar à lista de conversas" onClick={back}><ArrowLeft size={22} /></button>}<ChatAvatar preview name={name} image={image} className="size-10 text-sm" /><div className={styles.headerIdentity}><h1>{name}</h1><p role="status">{typing ? "digitando…" : status}</p></div><button type="button" className={styles.iconButton} aria-label="Atualizar conversa" onClick={refresh} disabled={disabled}><RefreshCw size={19} /></button></header>;
}
