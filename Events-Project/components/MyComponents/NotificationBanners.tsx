"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { Bell, X } from "lucide-react";
import type { NotificationDTO } from "@/types/features";

const DISPLAY_MS = 4000;
const clock = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

function NotificationBanner({ item, onDismiss }: { item: NotificationDTO; onDismiss: () => void }) {
  const reduced = useReducedMotion();
  const progress = useMotionValue(1);
  const remaining = useRef(DISPLAY_MS);
  const dragged = useRef(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || pressed || focused;
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    if (paused) return;
    const start = performance.now();
    const animation = reduced ? undefined : animate(progress, 0, {
      duration: remaining.current / 1000, ease: "linear",
    });
    const timer = window.setTimeout(() => dismiss.current(), remaining.current);
    return () => {
      window.clearTimeout(timer);
      animation?.stop();
      remaining.current = Math.max(0, remaining.current - (performance.now() - start));
    };
  }, [paused, progress, reduced]);

  useEffect(() => {
    if (!pressed) return;
    const release = () => setPressed(false);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
  }, [pressed]);

  const href = /^\/(?![\/\\])/.test(item.href) && !/[\\\u0000-\u0020]/.test(item.href)
    ? item.href
    : "/notificacoes";

  return (
    <motion.div
      className="pointer-events-auto relative flex touch-pan-y select-none items-start overflow-hidden rounded-2xl border border-border/80 bg-card/95 text-card-foreground shadow-lg backdrop-blur-md supports-[backdrop-filter]:bg-card/85"
      initial={reduced ? false : { y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={reduced ? undefined : { y: -8, opacity: 0, transition: { duration: 0.15 } }}
      transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }}
      drag={reduced ? false : "x"}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.55}
      dragMomentum={false}
      onPanStart={() => { dragged.current = true; }}
      onPanEnd={(_, { offset, velocity }) => {
        if (Math.abs(offset.x) > 72 || (Math.abs(offset.x) > 24 && Math.abs(velocity.x) > 650)) {
          onDismiss();
        }
      }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onPointerDown={() => { dragged.current = false; setPressed(true); }}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    >
      <Link
        href={href}
        draggable={false}
        onClick={event => {
          if (event.detail && dragged.current) {
            event.preventDefault();
            return;
          }
          onDismiss();
        }}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-xl py-3 pl-3 focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-primary"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-brand">
          <Bell className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1" role="alert">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-bold">{item.title}</p>
            <time dateTime={item.createdAt} className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {clock.format(new Date(item.createdAt))}
            </time>
          </div>
          <p className="line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground">{item.message}</p>
        </div>
      </Link>
      <button
        type="button"
        aria-label="Dispensar notificação"
        className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-primary"
        onClick={onDismiss}
      >
        <X className="size-4" aria-hidden="true" />
      </button>
      <motion.span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary/70" style={{ scaleX: progress }} />
    </motion.div>
  );
}

export function NotificationBanners({ items, onDismiss }: { items: NotificationDTO[]; onDismiss: (id: string) => void }) {
  const reduced = useReducedMotion();
  return (
    <div className="pointer-events-none fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[110] mx-auto flex max-w-sm flex-col gap-2">
      <AnimatePresence mode="popLayout">
        {items.map(item => (
          <motion.div
            key={item.id}
            layout={reduced ? false : "position"}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          >
            <NotificationBanner item={item} onDismiss={() => onDismiss(item.id)} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
