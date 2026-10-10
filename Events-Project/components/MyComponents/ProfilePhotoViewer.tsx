"use client";

import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function ProfilePhotoViewer({ src, label, className, children }: { src: string; label: string; className?: string; children: ReactNode }) {
  const [failed, setFailed] = useState(false);
  return <Dialog onOpenChange={open => { if (open) setFailed(false); }}>
    <DialogTrigger asChild><button type="button" aria-label={`Ampliar: ${label}`} onClick={event => event.stopPropagation()} className={cn("relative inline-flex shrink-0 cursor-zoom-in items-center justify-center border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&>img]:h-full [&>img]:w-full", className)}>{children}</button></DialogTrigger>
    <DialogContent onClick={event => event.stopPropagation()} className="max-h-[calc(100dvh-2rem)] w-[calc(100%_-_2rem)] max-w-3xl gap-3 overflow-hidden rounded-3xl bg-card p-4 shadow-surface sm:p-6 [&>button]:hidden">
      <div className="flex min-h-11 items-center justify-between gap-4"><DialogTitle className="min-w-0 break-words text-base">{label}</DialogTitle><DialogClose asChild><button type="button" aria-label="Fechar foto ampliada" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-muted/50 text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X size={20} aria-hidden="true" /></button></DialogClose></div>
      <DialogDescription className="sr-only">Foto de perfil ampliada. Pressione Escape ou toque fora da janela para fechar.</DialogDescription>
      <div className="flex min-h-40 items-center justify-center overflow-hidden rounded-2xl bg-muted/30">{failed ? <p role="status" className="p-6 text-center text-sm text-muted-foreground">Não foi possível carregar a foto.<button type="button" onClick={() => setFailed(false)} className="mx-auto mt-3 flex min-h-11 items-center rounded-full border border-border px-4 font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Tentar novamente</button></p> : <img src={src} alt={label} referrerPolicy="no-referrer" onError={() => setFailed(true)} className="max-h-[calc(100dvh-10rem)] w-full object-contain" />}</div>
    </DialogContent>
  </Dialog>;
}
