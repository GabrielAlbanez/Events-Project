"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, MessageCircle } from "lucide-react";
import { ChatAvatar } from "../ChatAvatar";
import styles from "./Chat.module.css";

export interface ChatListItem { id: string; name: string; image?: string | null; href: string; unreadCount?: number; preview?: string; createdAt?: string }
export function ChatList({ items, selected, onSelect, loading = false, title = "Conversas" }: { items: ChatListItem[]; selected?: string; onSelect?: () => void; loading?: boolean; title?: string }) {
  const [search, setSearch] = useState("");
  const visible = items.filter(item => item.name.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")));
  return <aside className={styles.list} aria-label="Lista de conversas"><div className={styles.listHeading}><h2>{title}</h2><MessageCircle size={22} aria-hidden="true" /></div><div className={styles.search}><Search size={18} aria-hidden="true" /><input aria-label="Buscar conversa" placeholder="Buscar uma conversa" value={search} onChange={event => setSearch(event.target.value)} /></div><nav aria-label="Conversas">{loading && <p className={styles.empty} role="status">Carregando conversas…</p>}{!loading && visible.length === 0 && <p className={styles.empty}>{search ? "Nenhuma conversa encontrada." : "Seus matches aparecerão aqui."}</p>}{visible.map(item => <Link key={item.id} href={item.href} aria-current={selected === item.id ? "page" : undefined} className={`${styles.listItem} ${selected === item.id ? styles.selected : ""}`} onClick={onSelect}><ChatAvatar name={item.name} image={item.image} className="size-12 text-sm" /><div className={styles.listIdentity}><div><strong>{item.name}</strong>{item.createdAt && <time dateTime={item.createdAt}>{new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.createdAt))}</time>}</div><div><p>{item.preview || "Comece uma conversa"}</p>{!!item.unreadCount && <span className={styles.badge} aria-label={`${item.unreadCount} mensagens não lidas`}>{item.unreadCount}</span>}</div></div></Link>)}</nav></aside>;
}
