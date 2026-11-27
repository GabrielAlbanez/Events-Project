"use client";
import { useState, type ReactNode } from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowDown, ArrowUp, Check, Copy, Download, PartyPopper, SquarePlus, X } from "lucide-react";
import { useInstallApp, type InstallPlatform } from "@/hooks/useInstallApp";
import PushSettings from "./PushSettings";

const APP_ICON = "/branding/app-icon-192.png";
const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const ctaButton = `inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-cta px-5 text-sm font-semibold text-cta-foreground transition hover:brightness-105 disabled:opacity-60 motion-reduce:transition-none ${focusRing}`;
const ghostButton = `inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground ${focusRing}`;

/** Outline of the iOS share control (square with an arrow leaving it), drawn here: no Apple assets. */
export function ShareGlyph({ className = "" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m8 7 4-4 4 4" /><path d="M8.5 10H6.8A1.8 1.8 0 0 0 5 11.8v7.4A1.8 1.8 0 0 0 6.8 21h10.4a1.8 1.8 0 0 0 1.8-1.8v-7.4a1.8 1.8 0 0 0-1.8-1.8h-1.7" /></svg>;
}

/** Page link without query or hash, so nothing private is copied. */
export function installLink(location: { origin: string; pathname: string }): string {
  return location.origin + (location.pathname || "/");
}

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* in-app webviews often block the async clipboard */ }
  try {
    const field = document.createElement("textarea");
    field.value = text; field.setAttribute("readonly", ""); field.style.position = "fixed"; field.style.opacity = "0";
    document.body.appendChild(field); field.select();
    const copied = document.execCommand("copy");
    field.remove();
    return copied;
  } catch { return false; }
}

function useCopyLink() {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => setStatus(await copyText(installLink(window.location)) ? "copied" : "failed");
  return { status, copy };
}

type Step = { icon: ReactNode; title: ReactNode; text: string };
function stepsFor(platform: InstallPlatform): Step[] {
  const where = platform.ipad ? "no canto superior direito do Safari" : "na barra do Safari, embaixo da tela";
  const safariSteps: Step[] = [
    { icon: <ShareGlyph className="size-5" />, title: <>Toque em <strong>Compartilhar</strong></>, text: `O ícone fica ${where}. No iOS 26, toque antes em •••.` },
    { icon: <SquarePlus className="size-5" aria-hidden="true" />, title: <>Escolha <strong>Adicionar à Tela de Início</strong></>, text: "Se não aparecer, role a lista de opções para baixo." },
    { icon: <Check className="size-5" aria-hidden="true" />, title: <>Toque em <strong>Adicionar</strong></>, text: "Pronto: o EventMap abre direto da sua tela de início, como um app." },
  ];
  if (platform.kind === "ios-safari") return safariSteps;
  return [
    { icon: <Copy className="size-5" aria-hidden="true" />, title: <>Toque em <strong>Copiar link</strong></>, text: "Este navegador não consegue instalar apps no iPhone." },
    { icon: <ShareGlyph className="size-5" />, title: <>Abra o <strong>Safari</strong> e cole o link</>, text: "Depois toque em Compartilhar (no iOS 26, em ••• → Compartilhar)." },
    { icon: <SquarePlus className="size-5" aria-hidden="true" />, title: <>Toque em <strong>Adicionar à Tela de Início</strong></>, text: "Confirme em Adicionar e o EventMap vira um app no seu celular." },
  ];
}

function CopyLinkRow() {
  const { status, copy } = useCopyLink();
  const [link] = useState(() => typeof window === "undefined" ? "" : installLink(window.location));
  return <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
    <label htmlFor="install-app-link" className="text-xs font-medium text-muted-foreground">Link do EventMap</label>
    <div className="flex gap-2">
      <input id="install-app-link" readOnly size={1} value={link} onFocus={event => event.currentTarget.select()} className={`min-h-11 min-w-0 flex-1 rounded-[16px] border bg-background px-3 text-sm ${focusRing}`} />
      <button type="button" onClick={() => void copy()} className={ctaButton}>{status === "copied" ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}{status === "copied" ? "Copiado" : "Copiar link"}</button>
    </div>
    <p aria-live="polite" className="min-h-5 text-xs text-muted-foreground">{status === "copied" ? "Link copiado. Agora abra o Safari e cole na barra de endereço." : status === "failed" ? "Não deu para copiar automaticamente. Toque no link acima e copie manualmente." : ""}</p>
  </div>;
}

/** Global guide sheet (mounted once by InstallAppProvider). Bottom sheet on phones, centered dialog on wider screens. */
export function InstallAppGuide() {
  const { mounted, platform, guideOpen, setGuideOpen } = useInstallApp();
  if (!mounted || (platform.kind !== "ios-safari" && platform.kind !== "ios-other")) return null;
  const safari = platform.kind === "ios-safari";
  const steps = stepsFor(platform);
  return <Dialog.Root open={guideOpen} onOpenChange={setGuideOpen}>
    <Dialog.Portal>
      <Dialog.Overlay data-install-guide="overlay" className="fixed inset-0 z-[100] grid items-end overflow-y-auto bg-black/50 backdrop-blur-[2px] motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 sm:place-items-center sm:p-4">
        <Dialog.Content data-install-guide="sheet" className="relative w-full rounded-t-[28px] border border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-card-foreground shadow-[var(--em-shadow-elevated)] outline-none motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:slide-in-from-bottom-6 motion-safe:data-[state=open]:duration-300 sm:max-w-[440px] sm:rounded-[26px] sm:pb-5">
          <span aria-hidden="true" className="mx-auto -mt-1 mb-4 block h-1 w-10 rounded-full bg-muted-foreground/30 sm:hidden" />
          <div className="flex items-start gap-3 pr-10">
            <Image src={APP_ICON} alt="" width={48} height={48} className="size-12 shrink-0 rounded-[14px] border border-border bg-white" />
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-bold tracking-[-0.03em]">{safari ? "Instale o EventMap" : "Abra no Safari para instalar"}</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm leading-6 text-muted-foreground">{safari ? "Três toques e ele fica na sua tela de início, como um app." : "No iPhone, só o Safari adiciona sites à tela de início."}</Dialog.Description>
            </div>
          </div>
          <Dialog.Close aria-label="Fechar guia de instalação" className={`absolute right-3 top-3 grid size-11 place-items-center rounded-full text-muted-foreground hover:bg-muted ${focusRing}`}><X className="size-5" aria-hidden="true" /></Dialog.Close>
          {!safari && <CopyLinkRow />}
          <ol className="mt-4 grid gap-2.5" aria-label="Passos para instalar">
            {steps.map((step, index) => <li key={index} style={{ animationDelay: `${120 + index * 140}ms` }} className="flex items-start gap-3 rounded-[18px] border border-border bg-background/60 p-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-both motion-safe:duration-300">
              <span className="relative grid size-11 shrink-0 place-items-center rounded-[14px] bg-primary/10 text-brand">{step.icon}<span aria-hidden="true" className="absolute -left-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-cta text-[11px] font-bold text-cta-foreground">{index + 1}</span></span>
              <span className="min-w-0 pt-0.5"><span className="block text-sm leading-5">{step.title}</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{step.text}</span></span>
            </li>)}
          </ol>
          {safari && !platform.ipad && <p data-install-guide="pointer" className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-brand"><ArrowDown className="size-5 motion-safe:animate-bounce" aria-hidden="true" />O botão Compartilhar fica na barra do Safari, aqui embaixo</p>}
          <Dialog.Close className={`${ctaButton} mt-4 w-full`}>Entendi</Dialog.Close>
        </Dialog.Content>
      </Dialog.Overlay>
      {/* iPad Safari keeps Compartilhar in the top toolbar: point there, outside the dialog. */}
      {safari && platform.ipad && guideOpen && <span data-install-guide="pointer" aria-hidden="true" className="pointer-events-none fixed right-6 top-3 z-[101] grid place-items-center rounded-full bg-cta p-2 text-cta-foreground shadow-[var(--em-shadow-elevated)]"><ArrowUp className="size-6 motion-safe:animate-bounce" /></span>}
    </Dialog.Portal>
  </Dialog.Root>;
}

function Shell({ compact, label, children }: { compact: boolean; label: string; children: ReactNode }) {
  return <section aria-label={label} data-install-card={compact ? "compact" : "full"} className={compact ? "mx-3 mb-3 flex items-start gap-3 rounded-[18px] border border-primary/20 bg-primary/5 p-3" : "flex items-start gap-4 rounded-[22px] border border-border bg-card p-4 shadow-[var(--em-shadow-card)] sm:p-5"}>{children}</section>;
}

/**
 * "Instale o EventMap" invitation. compact: one-line card for /conversas.
 * fallback renders when there is nothing to install (e.g. the push invitation), so the two never stack.
 */
export default function InstallAppCard({ variant = "full", fallback = null }: { variant?: "full" | "compact"; fallback?: ReactNode }) {
  const compact = variant === "compact";
  const { mounted, platform, installable, installed, welcome, dismissed, startInstall, dismiss, acknowledgeWelcome, setGuideOpen } = useInstallApp();
  const { status, copy } = useCopyLink();
  const [busy, setBusy] = useState(false);
  if (!mounted) return null;
  const icon = <Image src={APP_ICON} alt="" width={44} height={44} className={`${compact ? "size-10 rounded-[12px]" : "size-12 rounded-[14px]"} shrink-0 border border-border bg-white`} />;

  if (welcome) return <>
    <Shell compact={compact} label="App instalado">
      <span className={`grid ${compact ? "size-10" : "size-12"} shrink-0 place-items-center rounded-[12px] bg-cta text-cta-foreground`}><PartyPopper className="size-5" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1" role="status">
        <p className="text-sm font-semibold">App instalado!</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">Ative as notificações para saber quando alguém te mandar mensagem.</p>
      </div>
      <button type="button" onClick={acknowledgeWelcome} aria-label="Fechar aviso de app instalado" className={`-mr-1 -mt-1 grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted ${focusRing}`}><X className="size-4" aria-hidden="true" /></button>
    </Shell>
    {/* Same push invitation as before: shows only while avisos can be enabled for a signed-in account. */}
    {installed && <PushSettings variant="compact" />}
  </>;

  if (!installable || dismissed) {
    // On an iPhone outside the Home Screen push is unavailable: the fallback would only repeat the install hint.
    const iosBrowser = !installed && (platform.kind === "ios-safari" || platform.kind === "ios-other");
    return iosBrowser ? null : <>{fallback}</>;
  }

  const inApp = platform.kind === "ios-other";
  const install = async () => { setBusy(true); try { await startInstall(); } finally { setBusy(false); } };
  return <Shell compact={compact} label="Instalar o app EventMap">
    {icon}
    <div className="min-w-0 flex-1">
      <p className={`${compact ? "text-sm" : "text-base"} font-semibold tracking-[-0.02em]`}>{inApp ? "Abra no Safari para instalar" : "Instale o EventMap no seu celular"}</p>
      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{inApp ? "Copie o link e abra no Safari para adicionar o EventMap à tela de início." : "Abra direto da tela de início, em tela cheia, e receba avisos de mensagens."}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {inApp ? <>
          <button type="button" onClick={() => void copy()} className={ctaButton}>{status === "copied" ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}{status === "copied" ? "Link copiado" : "Copiar link"}</button>
          <button type="button" onClick={() => setGuideOpen(true)} className={ghostButton}>Ver passos</button>
        </> : <button type="button" disabled={busy} onClick={() => void install()} className={ctaButton}><Download className="size-4" aria-hidden="true" />{busy ? "Aguarde…" : "Instalar app"}</button>}
        {!inApp && <button type="button" onClick={dismiss} className={ghostButton}>Agora não</button>}
      </div>
      {inApp && <p aria-live="polite" className="text-xs text-muted-foreground empty:hidden">{status === "copied" ? "Agora abra o Safari e cole o link." : status === "failed" ? "Não deu para copiar. Toque em Ver passos para copiar manualmente." : ""}</p>}
    </div>
    {/* Two actions already fill the 390px row: "Agora não" becomes the corner close here. */}
    {inApp && <button type="button" onClick={dismiss} aria-label="Agora não" title="Agora não" className={`-mr-1 -mt-1 grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted ${focusRing}`}><X className="size-4" aria-hidden="true" /></button>}
  </Shell>;
}

/** Small footer entry; renders its own <li> only when something can be installed. */
export function InstallAppFooterLink() {
  const { installable, startInstall } = useInstallApp();
  if (!installable) return null;
  return <li><button type="button" onClick={() => void startInstall()} className="inline-flex min-h-11 items-center gap-1.5 rounded-full text-sm font-medium text-muted-foreground transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"><Download className="size-4" aria-hidden="true" />Instalar app</button></li>;
}
