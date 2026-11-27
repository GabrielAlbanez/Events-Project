"use client";

import type { ReactNode } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { ChatAvatar } from "../ChatAvatar";
import styles from "./Chat.module.css";

export type ChatStatusTone = "live" | "wait" | "off";
export function ChatHeader({ name, image, status, tone = "off", typing, refresh, disabled, back, action, badge }: { name: string; image?: string | null; status: string; tone?: ChatStatusTone; typing: boolean; refresh: () => void; disabled: boolean; back?: () => void; action?: ReactNode; badge?: ReactNode }) {
  return <header className={styles.header}>{back && <button type="button" className={`${styles.iconButton} ${styles.mobileBack}`} aria-label="Voltar à lista de conversas" onClick={back}><ArrowLeft size={22} /></button>}<ChatAvatar preview name={name} image={image} className="size-10 text-sm" /><div className={styles.headerIdentity}><h1>{name}</h1><p role="status"><span aria-hidden="true" className={styles.statusDot} data-tone={typing ? "typing" : tone} /><span>{typing ? "digitando…" : status}</span></p>{badge && <div className={styles.headerBadge}>{badge}</div>}</div><div className={styles.headerActions}>{action}<button type="button" className={styles.iconButton} aria-label="Atualizar conversa" title="Atualizar conversa" onClick={refresh} disabled={disabled}><RefreshCw size={19} /></button></div></header>;
}
