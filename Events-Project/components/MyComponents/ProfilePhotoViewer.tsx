"use client";

import { useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion, useReducedMotion } from "framer-motion";
import { Dialog, DialogDescription, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import styles from "./ProfilePhotoViewer.module.css";

const AnimatedPhotoContent = motion.create(DialogPrimitive.Content);

export function ProfilePhotoViewer({ src, label, name, className, children }: { src: string; label: string; name?: string | null; className?: string; children: ReactNode }) {
  const [failed, setFailed] = useState(false);
  const reduceMotion = useReducedMotion();
  return <Dialog onOpenChange={open => { if (open) setFailed(false); }}>
    <DialogTrigger asChild><button type="button" aria-label={`Ampliar: ${label}`} onClick={event => event.stopPropagation()} className={cn("relative inline-flex shrink-0 cursor-zoom-in items-center justify-center border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&>img]:h-full [&>img]:w-full", className)}>{children}</button></DialogTrigger>
    <DialogPortal>
    <DialogOverlay />
    <AnimatedPhotoContent
      initial={reduceMotion ? false : { opacity: 0, scale: 0.9, x: "-50%", y: "-50%" }}
      animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
      transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
      onClick={event => event.stopPropagation()} className={cn(styles.viewer, "fixed left-1/2 top-1/2 z-[100] grid max-h-[calc(100dvh-2rem)] w-[calc(100%_-_2rem)] max-w-3xl gap-3 overflow-hidden p-0 outline-none")}>
      <DialogTitle className="min-w-0 break-words text-center text-base text-primary">{name?.trim() || label}</DialogTitle>
      <DialogDescription className="sr-only">Foto de perfil ampliada. Pressione Escape ou toque fora da janela para fechar.</DialogDescription>
      <div className="flex min-h-40 items-center justify-center overflow-hidden rounded-2xl">{failed ? <p role="status" className="p-6 text-center text-sm text-muted-foreground">Não foi possível carregar a foto.<button type="button" onClick={() => setFailed(false)} className="mx-auto mt-3 flex min-h-11 items-center rounded-full border border-border px-4 font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Tentar novamente</button></p> : <img src={src} alt={label} referrerPolicy="no-referrer" onError={() => setFailed(true)} className="max-h-[calc(100dvh-10rem)] w-full object-contain" />}</div>
    </AnimatedPhotoContent>
    </DialogPortal>
  </Dialog>;
}
