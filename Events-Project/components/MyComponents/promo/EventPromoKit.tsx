"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-toastify";
import { Copy, Download, ExternalLink, Image as ImageIcon, Link2, Loader2, Megaphone, MessageCircle, Printer, QrCode, Share2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  buildPromoMessage,
  promoDateText,
  promoEventUrl,
  promoPriceText,
  promoQrFileName,
  promoShareImagePath,
  promoShortUrl,
  promoVariants,
  whatsappShareUrl,
  type PromoEvent,
  type PromoVariantId,
} from "@/lib/promoKit";

type EventPromoKitProps = {
  event: PromoEvent;
  /** Public site origin from the server (publicSiteUrl). Falls back to the current browser origin. */
  siteOrigin?: string;
  triggerClassName?: string;
  triggerLabel?: string;
};

const notify = (text: string, type: "success" | "error" | "info" = "success") => toast(text, { type, toastId: `promo-kit:${text}` });
const action = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50";
const section = "space-y-3 rounded-2xl border bg-card p-4 sm:p-5";
const sectionTitle = "flex items-center gap-2 text-base font-semibold";

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* falls back below */ }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  } catch {
    return false;
  }
}

function downloadHref(href: string, fileName: string) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export default function EventPromoKit({ event, siteOrigin, triggerClassName, triggerLabel = "Divulgar" }: EventPromoKitProps) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState(siteOrigin ?? "");
  const variants = useMemo(() => promoVariants(event), [event]);
  const [variant, setVariant] = useState<PromoVariantId>("curto");
  const [message, setMessage] = useState("");
  const [qr, setQr] = useState("");
  const [qrError, setQrError] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [imageState, setImageState] = useState<"loading" | "ready" | "error">("loading");
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  // Latest event without resetting the organizer's edits on every parent re-render (socket refreshes).
  const eventRef = useRef(event);
  eventRef.current = event;

  const url = useMemo(() => (origin ? promoEventUrl(origin, event.id) : null), [origin, event.id]);
  const imagePath = promoShareImagePath(event.id);
  const dateText = promoDateText(event);
  const priceText = promoPriceText(event);

  useEffect(() => {
    if (!siteOrigin) setOrigin(window.location.origin);
    setCanShare(typeof navigator.share === "function");
  }, [siteOrigin]);

  // Regenerates the text when the dialog opens or the variant changes; manual edits stay until then.
  useEffect(() => {
    if (open && url) setMessage(buildPromoMessage(eventRef.current, variant, url));
  }, [open, variant, url]);

  useEffect(() => {
    if (open) setImageState("loading");
  }, [open]);

  useEffect(() => {
    if (!variants.some((item) => item.id === variant)) setVariant("curto");
  }, [variants, variant]);

  useEffect(() => {
    if (!open || !url) return;
    let active = true;
    setQrError(false);
    import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: "M", color: { dark: "#070B1F", light: "#FFFFFF" } }))
      .then((data) => { if (active) setQr(data); })
      .catch(() => { if (active) setQrError(true); });
    return () => { active = false; };
  }, [open, url]);

  useEffect(() => {
    if (!printing) return;
    const done = () => {
      document.body.classList.remove("em-printing-poster");
      setPrinting(false);
    };
    document.body.classList.add("em-printing-poster");
    window.addEventListener("afterprint", done);
    // Waits a frame so the poster portal is in the DOM before the print dialog opens.
    const frame = window.requestAnimationFrame(() => window.print());
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", done);
      document.body.classList.remove("em-printing-poster");
    };
  }, [printing]);

  async function handleCopy(text: string, success: string) {
    if (await copyText(text)) notify(success);
    else {
      notify("Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.", "error");
      messageRef.current?.select();
    }
  }

  async function handleShare() {
    if (!url) return;
    try {
      await navigator.share({ title: event.nome, text: message });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      notify("Não foi possível abrir o compartilhamento. Use o WhatsApp ou copie o texto.", "error");
    }
  }

  async function handleDownloadImage() {
    setDownloading(true);
    try {
      const response = await fetch(imagePath);
      if (!response.ok) throw new Error("image");
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) throw new Error("image");
      const href = URL.createObjectURL(blob);
      downloadHref(href, promoQrFileName(event).replace(/^qr-/, "divulgacao-"));
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
      notify("Imagem baixada.");
    } catch {
      window.open(imagePath, "_blank", "noopener,noreferrer");
      notify("Abrimos a imagem em outra aba. Salve-a por lá.", "info");
    } finally {
      setDownloading(false);
    }
  }

  // Radio group keyboard pattern: arrows move and select, one tab stop.
  function handleVariantKey(keyEvent: KeyboardEvent<HTMLDivElement>) {
    const step = keyEvent.key === "ArrowRight" || keyEvent.key === "ArrowDown" ? 1 : keyEvent.key === "ArrowLeft" || keyEvent.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    keyEvent.preventDefault();
    const index = variants.findIndex((item) => item.id === variant);
    const next = variants[(index + step + variants.length) % variants.length];
    setVariant(next.id);
    keyEvent.currentTarget.querySelector<HTMLButtonElement>(`[data-variant="${next.id}"]`)?.focus();
  }

  const disabled = !url;
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>
      <button type="button" className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 text-sm font-semibold text-brand hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary", triggerClassName)}>
        <Megaphone className="size-4 shrink-0" aria-hidden="true" />{triggerLabel}
      </button>
    </DialogTrigger>
    <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-2xl gap-5 overflow-y-auto rounded-2xl bg-background p-4 pt-5 sm:p-6">
      <DialogHeader className="pr-8 text-left">
        <DialogTitle className="text-xl font-semibold tracking-tight">Kit de divulgação</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          Tudo pronto para espalhar <span className="font-medium text-foreground">{event.nome}</span>: mensagem, link, QR Code e imagem.
        </DialogDescription>
      </DialogHeader>

      <section aria-labelledby={`${ids}-message-title`} className={section}>
        <h3 id={`${ids}-message-title`} className={sectionTitle}><MessageCircle className="size-4 text-brand" aria-hidden="true" />Mensagem para WhatsApp</h3>
        <div role="radiogroup" aria-label="Estilo da mensagem" className="grid gap-2 sm:grid-cols-3" onKeyDown={handleVariantKey}>
          {variants.map((item) => {
            const selected = item.id === variant;
            return <button key={item.id} type="button" role="radio" aria-checked={selected} tabIndex={selected ? 0 : -1} data-variant={item.id} onClick={() => setVariant(item.id)} className={cn("min-h-11 rounded-xl border px-3 py-2 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary", selected ? "border-primary bg-primary/10 text-foreground" : "hover:bg-muted")}>
              <span className="block font-semibold">{item.label}</span>
              <span className="block text-xs text-muted-foreground">{item.description}</span>
            </button>;
          })}
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${ids}-message`} className="text-sm font-medium">Texto (você pode editar)</label>
          <textarea id={`${ids}-message`} ref={messageRef} value={message} onChange={(change) => setMessage(change.target.value)} rows={8} className="w-full resize-y rounded-xl border bg-background p-3 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-primary" />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <a href={whatsappShareUrl(message)} target="_blank" rel="noopener noreferrer" aria-disabled={disabled || !message.trim()} className={cn(action, "border-transparent bg-[#1f7a4d] text-white hover:bg-[#19663f] dark:bg-[#25D366] dark:text-[#04220f] dark:hover:bg-[#1fb457]", (disabled || !message.trim()) && "pointer-events-none opacity-50")}>
            <MessageCircle className="size-4" aria-hidden="true" />Enviar no WhatsApp<span className="sr-only"> (abre em nova aba)</span>
          </a>
          <button type="button" disabled={!message.trim()} onClick={() => void handleCopy(message, "Texto copiado.")} className={action}><Copy className="size-4" aria-hidden="true" />Copiar texto</button>
          <button type="button" disabled={disabled} onClick={() => url && void handleCopy(url, "Link copiado.")} className={action}><Link2 className="size-4" aria-hidden="true" />Copiar link</button>
          {canShare && <button type="button" disabled={disabled} onClick={() => void handleShare()} className={action}><Share2 className="size-4" aria-hidden="true" />Compartilhar</button>}
        </div>
        {url && <p className="break-all text-xs text-muted-foreground">Link do evento: <span className="font-medium text-foreground">{url}</span></p>}
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <section aria-labelledby={`${ids}-qr-title`} className={section}>
          <h3 id={`${ids}-qr-title`} className={sectionTitle}><QrCode className="size-4 text-brand" aria-hidden="true" />QR Code para cartazes</h3>
          <div className="flex aspect-square w-full max-w-[220px] items-center justify-center rounded-xl border bg-white p-2 mx-auto">
            {qr ? <img src={qr} alt={`QR Code que leva à página de ${event.nome}`} className="h-full w-full" /> : qrError ? <p role="alert" className="p-3 text-center text-sm text-red-700">Não foi possível gerar o QR Code.</p> : <Loader2 className="size-6 animate-spin text-neutral-500 motion-reduce:animate-none" aria-label="Gerando QR Code" />}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button type="button" disabled={!qr} onClick={() => downloadHref(qr, promoQrFileName(event))} className={action}><Download className="size-4" aria-hidden="true" />Baixar PNG</button>
            <button type="button" disabled={!qr || printing} onClick={() => setPrinting(true)} className={action}><Printer className="size-4" aria-hidden="true" />Imprimir cartaz</button>
          </div>
        </section>

        <section aria-labelledby={`${ids}-image-title`} className={section}>
          <h3 id={`${ids}-image-title`} className={sectionTitle}><ImageIcon className="size-4 text-brand" aria-hidden="true" />Imagem para stories e feed</h3>
          <div className="relative aspect-[1200/630] w-full overflow-hidden rounded-xl border bg-muted">
            {open && imageState !== "error" && <img src={imagePath} alt={`Arte de divulgação de ${event.nome}`} loading="lazy" onLoad={() => setImageState("ready")} onError={() => setImageState("error")} className={cn("h-full w-full object-cover", imageState === "loading" && "opacity-0")} />}
            {imageState === "loading" && <span role="status" className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">Carregando prévia…</span>}
            {imageState === "error" && <p className="absolute inset-0 flex items-center justify-center p-3 text-center text-xs text-muted-foreground">Prévia indisponível agora. Você ainda pode tentar baixar.</p>}
          </div>
          <p className="text-xs text-muted-foreground">Arte 1200×630 com nome, data e local. É a mesma imagem que aparece ao colar o link no WhatsApp.</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button type="button" disabled={downloading} onClick={() => void handleDownloadImage()} className={action}>{downloading ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}Baixar imagem</button>
            <a href={imagePath} target="_blank" rel="noopener noreferrer" className={action}><ExternalLink className="size-4" aria-hidden="true" />Abrir<span className="sr-only"> imagem em nova aba</span></a>
          </div>
        </section>
      </div>

      {printing && qr && url && createPortal(<div id="em-promo-poster" aria-hidden="true">
        <p className="em-poster-kicker">Você está convidado</p>
        <h1 className="em-poster-title">{event.nome}</h1>
        <p className="em-poster-line">{dateText}</p>
        {event.endereco && <p className="em-poster-line">{event.endereco}</p>}
        {priceText && <p className="em-poster-price">{priceText}</p>}
        <img src={qr} alt="" className="em-poster-qr" />
        <p className="em-poster-cta">Aponte a câmera para ver detalhes e se inscrever</p>
        <p className="em-poster-url">{promoShortUrl(url)}</p>
      </div>, document.body)}
    </DialogContent>
  </Dialog>;
}
