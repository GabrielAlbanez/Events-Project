"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import { Dialog, DialogClose, DialogDescription, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { profileMediaUrl } from "@/lib/profileMediaUrl";
import { cn } from "@/lib/utils";
import { normalizePhotoGallery, nextPhotoIndex, type PhotoViewerPhoto } from "@/lib/photoViewer";
export type { PhotoViewerPhoto } from "@/lib/photoViewer";

export interface PhotoViewerProps {
  src: string;
  label: string;
  className?: string;
  children: ReactNode;
  mode?: "avatar" | "message";
  gallery?: readonly PhotoViewerPhoto[];
  photoId?: string;
}

export function PhotoViewer({ src, label, className, children, mode = "avatar", gallery, photoId }: PhotoViewerProps) {
  const [failed, setFailed] = useState(false);
  const [snapshot, setSnapshot] = useState<{ photos: PhotoViewerPhoto[]; index: number } | null>(null);
  const swipe = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // Keep nested viewers inside the administrative modal's focus scope.
    setPortalContainer(trigger.current?.closest<HTMLElement>('[role="dialog"]') ?? null);
  }, []);
  const source = profileMediaUrl(src);
  const current = snapshot?.photos[snapshot.index] ?? { id: photoId || source || "", src: source || "", label };
  const count = snapshot?.photos.length ?? 1;
  const navigate = (delta: number) => { setFailed(false); setSnapshot(previous => previous ? { ...previous, index: nextPhotoIndex(previous.index, delta, previous.photos.length) } : previous); };
  if (!source) return <>{children}</>;
  return <Dialog onOpenChange={open => { if (open) { setFailed(false); const photos = normalizePhotoGallery(gallery, { id: photoId, src: source, label }); const index = photos.findIndex(photo => photoId ? photo.id === photoId : photo.src === source); setSnapshot({ photos, index: Math.max(0, index) }); } }}>
    <DialogTrigger asChild><button ref={trigger} type="button" aria-label={`Ampliar: ${label}`} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} className={cn("relative inline-flex shrink-0 cursor-zoom-in items-center justify-center border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background", mode === "avatar" && "[&>img]:h-full [&>img]:w-full", className)}>{children}</button></DialogTrigger>
    <DialogPortal container={portalContainer}>
      <DialogOverlay className="z-[1200]" />
      <DialogPrimitive.Content onKeyDown={event => { if (count < 2 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !["ArrowLeft", "ArrowRight"].includes(event.key) || (event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable="true"]'))) return; event.preventDefault(); event.stopPropagation(); navigate(event.key === "ArrowLeft" ? -1 : 1); }} onEscapeKeyDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} className="fixed left-1/2 top-1/2 z-[1201] grid max-h-[calc(100dvh-2rem)] w-[calc(100%_-_2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 gap-3 overflow-hidden rounded-3xl border border-border bg-card p-4 text-foreground shadow-surface outline-none sm:p-6">
        <div className="flex min-h-11 items-center justify-between gap-4"><DialogTitle className="min-w-0 break-words text-base">{current.label}</DialogTitle><DialogClose asChild><button type="button" aria-label="Fechar foto ampliada" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-muted/50 text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X size={20} aria-hidden="true" /></button></DialogClose></div>
        <DialogDescription className="sr-only">Foto ampliada. Pressione Escape ou toque fora da janela para fechar.</DialogDescription>
        <div onPointerDown={event => { event.stopPropagation(); if (event.pointerType !== "mouse" && count > 1) { swipe.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }; event.currentTarget.setPointerCapture(event.pointerId); } }} onPointerCancel={() => { swipe.current = null; }} onPointerUp={event => { const start = swipe.current; swipe.current = null; if (!start || event.pointerId !== start.pointerId) return; const x = event.clientX - start.x, y = event.clientY - start.y; if (Math.abs(x) > 60 && Math.abs(x) > Math.abs(y) * 1.4) navigate(x < 0 ? 1 : -1); }} style={{ touchAction: count > 1 ? "pan-y" : "auto" }} className="flex min-h-40 items-center justify-center overflow-hidden rounded-2xl bg-muted/30">{failed ? <p role="status" className="p-6 text-center text-sm text-muted-foreground">Não foi possível carregar a foto.<button type="button" onClick={() => setFailed(false)} className="mx-auto mt-3 flex min-h-11 items-center rounded-full border border-border px-4 font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Tentar novamente</button></p> : <img key={current.id} src={current.src} alt={current.label} draggable={false} referrerPolicy="no-referrer" onError={() => setFailed(true)} className="max-h-[calc(100dvh-13rem)] w-full object-contain" />}</div>
        {count > 1 && <div className="flex min-h-11 items-center justify-center gap-4"><button type="button" aria-label="Foto anterior" onClick={() => navigate(-1)} className="inline-flex size-11 items-center justify-center rounded-full border border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ChevronLeft size={20} aria-hidden="true" /></button><span role="status" aria-live="polite" aria-atomic="true" className="min-w-16 text-center text-sm text-muted-foreground">{(snapshot?.index ?? 0) + 1} de {count}</span><button type="button" aria-label="Próxima foto" onClick={() => navigate(1)} className="inline-flex size-11 items-center justify-center rounded-full border border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ChevronRight size={20} aria-hidden="true" /></button></div>}
        <a href={current.src} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="inline-flex min-h-11 items-center justify-center gap-2 justify-self-center rounded-full border border-border px-4 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Abrir original<ExternalLink size={16} aria-hidden="true" /></a>
      </DialogPrimitive.Content>
    </DialogPortal>
  </Dialog>;
}
