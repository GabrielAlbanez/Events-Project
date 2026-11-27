"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { usePartyInbox } from "@/hooks/usePartyInbox";

/** Header shortcut to /conversas with the unread total across every match. */
export default function ConversationsLink() {
  const pathname = usePathname();
  const { unreadTotal, loading } = usePartyInbox();
  const label = unreadTotal > 0 ? `Conversas, ${unreadTotal} ${unreadTotal === 1 ? "mensagem não lida" : "mensagens não lidas"}` : "Conversas";
  return <><Link href="/conversas" aria-label={label} title="Conversas" aria-current={pathname === "/conversas" || pathname.startsWith("/conversas/") ? "page" : undefined} className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-[current=page]:bg-muted motion-reduce:transition-none"><MessagesSquare className="size-5" aria-hidden="true" /><span aria-hidden="true" className={unreadTotal > 0 ? "absolute right-0.5 top-1 min-w-[18px] rounded-full bg-primary px-1 text-center text-[11px] font-bold leading-[18px] tabular-nums text-primary-foreground ring-2 ring-background" : "hidden"}>{unreadTotal > 99 ? "99+" : unreadTotal}</span></Link><span className="sr-only" aria-live="polite" aria-atomic="true">{loading ? "" : unreadTotal > 0 ? `${unreadTotal} ${unreadTotal === 1 ? "mensagem não lida" : "mensagens não lidas"} nas conversas.` : ""}</span></>;
}
