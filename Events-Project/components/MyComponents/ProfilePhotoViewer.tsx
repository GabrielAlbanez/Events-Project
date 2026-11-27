"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, LazyMotion, m, useMotionValue, useReducedMotion, useTransform, type PanInfo } from "framer-motion";
import { X } from "lucide-react";
import { loadLayoutFeatures } from "@/components/animations/config";
import { cn } from "@/lib/utils";

export type ViewerBox = { x: number; y: number; width: number; height: number; radius: number };

const openEase: [number, number, number, number] = [0.22, 1, 0.36, 1];
const closeEase: [number, number, number, number] = [0.4, 0, 0.6, 1];
/** Space kept below the photo for the name. */
const captionSpace = 72;
const gutter = 16;
/** Swipe distance (px) or speed (px/s) that closes the viewer. */
export const swipeCloseDistance = 110;
export const swipeCloseVelocity = 650;
/** Opacity fades run on the main thread: framer's WAAPI hand-off at the end of a fade dropped one frame to opacity 0 (backdrop flash). */
const mainThread = () => {};

export function shouldCloseFromSwipe(offsetY: number, velocityY: number): boolean {
  return offsetY > swipeCloseDistance || (offsetY > 24 && velocityY > swipeCloseVelocity);
}

/** Largest box with the photo's aspect that fits the viewport, centered above the caption. */
export function viewerTargetBox(viewportWidth: number, viewportHeight: number, aspect: number): ViewerBox {
  const maxWidth = Math.max(120, Math.min(viewportWidth - gutter * 2, 560));
  const maxHeight = Math.max(120, Math.min(viewportHeight - captionSpace * 2 - gutter, 640));
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  let width = Math.min(maxWidth, maxHeight * ratio);
  let height = width / ratio;
  if (height > maxHeight) { height = maxHeight; width = height * ratio; }
  width = Math.round(width); height = Math.round(height);
  return { x: Math.round((viewportWidth - width) / 2), y: Math.max(gutter, Math.round((viewportHeight - height - captionSpace) / 2)), width, height, radius: 28 };
}

/** Where the avatar sits on screen, or null when it is hidden or scrolled away (then the viewer just fades). */
function triggerBox(element: HTMLElement | null): ViewerBox | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > window.innerHeight) return null;
  const radius = Number.parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
  const parentRadius = element.parentElement ? Number.parseFloat(getComputedStyle(element.parentElement).borderTopLeftRadius) || 0 : 0;
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height, radius: Math.min(Math.max(radius, parentRadius), Math.max(rect.width, rect.height) / 2) };
}

export function ProfilePhotoViewer({ src, label, className, children }: { src: string; label: string; className?: string; children: ReactNode }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion() ?? false;
  const [open, setOpen] = useState(false);
  const [presence, setPresence] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [aspect, setAspect] = useState(1);
  const [viewport, setViewport] = useState({ width: 390, height: 844 });
  const [origin, setOrigin] = useState<ViewerBox | null>(null);
  const [placeholder, setPlaceholder] = useState("");
  const dragY = useMotionValue(0);
  const backdropOpacity = useTransform(dragY, [0, 320], [1, 0.15]);
  const photoScale = useTransform(dragY, [0, 320], [1, 0.86]);

  const changeOpen = useCallback((next: boolean) => {
    if (next) {
      const box = triggerBox(trigger.current);
      setOrigin(box);
      setPlaceholder(trigger.current?.querySelector("img")?.currentSrc || "");
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      setFailed(false);
      setLoaded(false);
      setAspect(1);
      dragY.set(0);
      setPresence(true);
    } else {
      // Shrink back to wherever the avatar is now (the page may have scrolled or resized).
      setOrigin(triggerBox(trigger.current));
    }
    setOpen(next);
  }, [dragY]);

  useEffect(() => {
    if (!open) return;
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [open]);

  const target = viewerTargetBox(viewport.width, viewport.height, aspect);
  const shared = !reduced && origin !== null;
  const hidden = shared && origin
    ? { opacity: 1, x: origin.x, y: origin.y, width: origin.width, height: origin.height, borderRadius: origin.radius }
    : { opacity: 0, x: target.x, y: target.y + (reduced ? 0 : 16), width: target.width, height: target.height, borderRadius: target.radius };
  const shown = { opacity: 1, x: target.x, y: target.y, width: target.width, height: target.height, borderRadius: target.radius };
  const enter = { duration: reduced ? 0.15 : 0.3, ease: openEase };
  const leave = { duration: reduced ? 0.12 : 0.26, ease: closeEase };

  const endSwipe = (_: unknown, info: PanInfo) => { if (shouldCloseFromSwipe(info.offset.y, info.velocity.y)) changeOpen(false); };
  const backdropClick = (event: MouseEvent<HTMLDivElement>) => { event.stopPropagation(); if (event.target === event.currentTarget) changeOpen(false); };

  return <DialogPrimitive.Root open={open} onOpenChange={changeOpen}>
    <DialogPrimitive.Trigger asChild>
      <button ref={trigger} type="button" aria-label={`Ampliar: ${label}`} onClick={event => event.stopPropagation()} onPointerEnter={() => { void loadLayoutFeatures(); }} onFocus={() => { void loadLayoutFeatures(); }} className={cn("relative inline-flex min-h-0 min-w-0 shrink-0 cursor-zoom-in items-center justify-center border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&>img]:h-full [&>img]:w-full", shared && presence && "[&>img]:opacity-0", className)}>{children}</button>
    </DialogPrimitive.Trigger>
    {presence && <LazyMotion features={loadLayoutFeatures} strict>
      <AnimatePresence onExitComplete={() => { setPresence(false); dragY.set(0); }}>
        {open && <DialogPrimitive.Portal key="photo-viewer" forceMount>
          <DialogPrimitive.Overlay forceMount asChild>
            <m.div key="backdrop" data-photo-viewer="backdrop" onUpdate={mainThread} className="fixed inset-0 z-[100]" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: enter }} exit={{ opacity: 0, transition: leave }}>
              <m.div aria-hidden="true" className="absolute inset-0 bg-[rgb(6_8_16/0.8)] backdrop-blur-xl" style={{ opacity: reduced ? 1 : backdropOpacity }} />
            </m.div>
          </DialogPrimitive.Overlay>
          <DialogPrimitive.Content forceMount asChild onOpenAutoFocus={event => { event.preventDefault(); closeButton.current?.focus(); }}>
            <m.div key="content" data-photo-viewer="content" className="fixed inset-0 z-[101] overflow-hidden outline-none" onClick={backdropClick} initial={{ opacity: 1 }} exit={{ opacity: 1, transition: leave }}>
              <DialogPrimitive.Description className="sr-only">Foto de perfil ampliada. Pressione Escape, toque fora da foto ou deslize para baixo para fechar.</DialogPrimitive.Description>
              <m.div data-photo-viewer="drag" className="pointer-events-none absolute inset-0" style={{ y: dragY }} drag={reduced ? false : "y"} dragDirectionLock dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0.06, bottom: 0.9 }} dragMomentum={false} onDragEnd={endSwipe}>
                <m.div data-photo-viewer="photo" onUpdate={mainThread} className="pointer-events-auto absolute left-0 top-0 touch-none overflow-hidden bg-muted shadow-[0_2px_4px_rgb(0_0_0/.25),0_32px_70px_-28px_rgb(0_0_0/.75)]" style={reduced ? undefined : { scale: photoScale }} initial={hidden} animate={{ ...shown, transition: enter }} exit={{ ...hidden, transition: leave }}>
                  {placeholder && <img src={placeholder} alt="" aria-hidden="true" draggable={false} className={cn("absolute inset-0 h-full w-full scale-110 object-cover object-center blur-xl transition-opacity duration-300 motion-reduce:transition-none", loaded && "opacity-0")} />}
                  {failed
                    ? <div role="status" className="absolute inset-0 grid place-items-center bg-card/90 p-6 text-center text-sm text-muted-foreground"><p>Não foi possível carregar a foto.<button type="button" onClick={() => { setFailed(false); setLoaded(false); setAttempt(value => value + 1); }} className="mx-auto mt-3 flex min-h-11 items-center rounded-full border border-border bg-card px-4 font-semibold text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Tentar novamente</button></p></div>
                    : <img key={attempt} src={src} alt={label} referrerPolicy="no-referrer" draggable={false} onLoad={event => { const image = event.currentTarget; if (image.naturalWidth && image.naturalHeight) setAspect(image.naturalWidth / image.naturalHeight); setLoaded(true); }} onError={() => setFailed(true)} className={cn("absolute inset-0 h-full w-full select-none object-cover object-center transition-opacity duration-300 motion-reduce:transition-none", loaded ? "opacity-100" : "opacity-0")} />}
                </m.div>
                <m.div className="pointer-events-none absolute inset-x-0 px-4 text-center" onUpdate={mainThread} style={{ top: target.y + target.height + 18 }} initial={{ opacity: 0, y: reduced ? 0 : 10 }} animate={{ opacity: 1, y: 0, transition: { ...enter, delay: reduced ? 0 : 0.12 } }} exit={{ opacity: 0, y: reduced ? 0 : 6, transition: { duration: 0.12 } }}>
                  <DialogPrimitive.Title className="mx-auto max-w-md break-words text-base font-semibold text-white [text-shadow:0_1px_8px_rgb(0_0_0/.45)]">{label}</DialogPrimitive.Title>
                  {!reduced && <p aria-hidden="true" className="mt-1 text-xs text-white/60 sm:hidden">Deslize para baixo para fechar</p>}
                </m.div>
              </m.div>
              <m.div className="absolute right-[max(1rem,env(safe-area-inset-right))] onUpdate={mainThread} top-[max(1rem,env(safe-area-inset-top))]" initial={{ opacity: 0, scale: reduced ? 1 : 0.8 }} animate={{ opacity: 1, scale: 1, transition: { ...enter, delay: reduced ? 0 : 0.08 } }} exit={{ opacity: 0, transition: { duration: 0.12 } }}>
                <DialogPrimitive.Close asChild><button ref={closeButton} type="button" aria-label="Fechar foto ampliada" className="inline-flex size-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><X size={20} aria-hidden="true" /></button></DialogPrimitive.Close>
              </m.div>
            </m.div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>}
      </AnimatePresence>
    </LazyMotion>}
  </DialogPrimitive.Root>;
}
