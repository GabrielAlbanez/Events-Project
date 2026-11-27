"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Minus, Move, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { clampCrop, clampZoom, cropScale, cropSourceRect, cropZoomMax, cropZoomMin, renderCroppedPhoto, type CropState } from "@/lib/photoCrop";

type Loaded = { bitmap: ImageBitmap; url: string };
const start: CropState = { zoom: 1, offsetX: 0, offsetY: 0 };
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

/** "Ajustar foto": drag, zoom (slider, pinch, keyboard) and export a centered square before the normal upload. */
export function PhotoCropDialog({ file, onCancel, onConfirm }: { file: File | null; onCancel: () => void; onConfirm: (file: File) => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [crop, setCrop] = useState<CropState>(start);
  const [viewport, setViewport] = useState(280);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const frame = useRef<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  useEffect(() => {
    setLoaded(null); setLoadError(false); setCrop(start); setError(""); setBusy(false);
    if (!file) return;
    let cancelled = false; let result: Loaded | null = null;
    createImageBitmap(file, { imageOrientation: "from-image" }).then(bitmap => {
      if (cancelled) { bitmap.close(); return; }
      result = { bitmap, url: URL.createObjectURL(file) };
      setLoaded(result);
    }).catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; if (result) { result.bitmap.close(); URL.revokeObjectURL(result.url); } };
  }, [file]);

  useEffect(() => {
    const element = frame.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => { if (element.clientWidth) setViewport(element.clientWidth); });
    observer.observe(element);
    return () => observer.disconnect();
  }, [loaded]);

  const width = loaded?.bitmap.width ?? 1, height = loaded?.bitmap.height ?? 1;
  const update = (next: CropState) => setCrop(clampCrop(width, height, viewport, next));
  const zoomTo = (zoom: number) => setCrop(old => { const next = clampZoom(zoom); const ratio = next / old.zoom; return clampCrop(width, height, viewport, { zoom: next, offsetX: old.offsetX * ratio, offsetY: old.offsetY * ratio }); });
  const view = clampCrop(width, height, viewport, crop);
  const scale = cropScale(width, height, viewport, view.zoom);

  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) { const [a, b] = Array.from(pointers.current.values()); pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: view.zoom }; }
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2 && pinch.current) { const [a, b] = Array.from(pointers.current.values()); zoomTo(pinch.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.distance)); return; }
    update({ ...view, offsetX: view.offsetX + event.clientX - previous.x, offsetY: view.offsetY + event.clientY - previous.y });
  };
  const pointerUp = (event: PointerEvent<HTMLDivElement>) => { pointers.current.delete(event.pointerId); if (pointers.current.size < 2) pinch.current = null; };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 32 : 8;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) { event.preventDefault(); update({ ...view, offsetX: view.offsetX + moves[event.key][0], offsetY: view.offsetY + moves[event.key][1] }); }
    else if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomTo(view.zoom + 0.1); }
    else if (event.key === "-" || event.key === "_") { event.preventDefault(); zoomTo(view.zoom - 0.1); }
    else if (event.key === "0") { event.preventDefault(); setCrop(start); }
  };
  const confirm = async () => {
    if (!file || busy) return;
    if (!loaded) { onConfirm(file); return; }
    setBusy(true); setError("");
    try { onConfirm(await renderCroppedPhoto(loaded.bitmap, cropSourceRect(width, height, viewport, view))); }
    catch { setError("Não foi possível ajustar a foto. Tente outra imagem ou envie sem ajustar."); }
    finally { setBusy(false); }
  };

  return <Dialog open={!!file} onOpenChange={next => { if (!next && !busy) onCancel(); }}>
    <DialogContent className="w-[calc(100%_-_2rem)] max-w-md gap-4 rounded-[26px] bg-card p-5 shadow-surface sm:p-6">
      <div className="pr-8"><DialogTitle className="text-lg font-bold tracking-[-0.02em]">Ajustar foto</DialogTitle><DialogDescription className="mt-1 text-sm leading-6 text-muted-foreground">Arraste para centralizar seu rosto no círculo e use o zoom para aproximar.</DialogDescription></div>
      {loadError ? <p role="alert" className="rounded-2xl bg-muted/50 p-4 text-sm text-muted-foreground">Não foi possível abrir esta imagem para ajuste. Você pode enviá-la como está.</p>
        : <div ref={frame} role="group" tabIndex={0} aria-label="Área de recorte da foto. Use as setas para mover, + e - para zoom e 0 para recentralizar." aria-busy={!loaded} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onKeyDown={keyDown} onWheel={event => zoomTo(view.zoom - event.deltaY * 0.002)} className="relative mx-auto aspect-square w-full max-w-[320px] cursor-grab touch-none select-none overflow-hidden rounded-[22px] bg-[rgb(10_12_20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card active:cursor-grabbing">
          {loaded ? <img src={loaded.url} alt="" aria-hidden="true" draggable={false} className="pointer-events-none absolute left-1/2 top-1/2 max-w-none" style={{ width: width * scale, height: height * scale, transform: `translate(calc(-50% + ${view.offsetX}px), calc(-50% + ${view.offsetY}px))` }} />
            : <p role="status" className="absolute inset-0 grid place-items-center text-sm text-white/70">Carregando foto…</p>}
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgb(6_8_16/0.6)] ring-2 ring-white/85" />
          {loaded && <span aria-hidden="true" className="pointer-events-none absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white"><Move size={13} /> Arraste para ajustar</span>}
        </div>}
      {!loadError && <div className="flex items-center gap-3">
        <button type="button" aria-label="Diminuir zoom" onClick={() => zoomTo(view.zoom - 0.25)} disabled={!loaded || view.zoom <= cropZoomMin} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"><Minus size={18} aria-hidden="true" /></button>
        <label className="sr-only" htmlFor="photo-crop-zoom">Zoom da foto</label>
        <input id="photo-crop-zoom" type="range" min={cropZoomMin} max={cropZoomMax} step={0.01} value={view.zoom} disabled={!loaded} onChange={event => zoomTo(Number(event.target.value))} aria-valuetext={`${Math.round(view.zoom * 100)}%`} className="h-11 min-w-0 flex-1 cursor-pointer accent-[hsl(var(--primary))]" />
        <button type="button" aria-label="Aumentar zoom" onClick={() => zoomTo(view.zoom + 0.25)} disabled={!loaded || view.zoom >= cropZoomMax} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"><Plus size={18} aria-hidden="true" /></button>
      </div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} disabled={busy} className={`${button} border border-border hover:bg-muted`}>Cancelar</button>
        {(loadError || error) && <button type="button" onClick={() => file && onConfirm(file)} disabled={busy} className={`${button} border border-border hover:bg-muted`}>Enviar sem ajustar</button>}
        {!loadError && <button type="button" onClick={confirm} disabled={busy || !loaded} className={`${button} bg-cta text-cta-foreground hover:brightness-95`}>{busy ? "Ajustando…" : "Usar foto"}</button>}
      </div>
    </DialogContent>
  </Dialog>;
}
