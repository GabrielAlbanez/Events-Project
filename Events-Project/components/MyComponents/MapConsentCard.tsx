"use client";

import Link from "next/link";
import { ArrowRight, Map as MapIcon } from "lucide-react";
import { useGoogleMaps } from "./GoogleMapsLoader";

/** Static decorative streets, parks and date pins (no external image, no Google request). */
function GhostMap() {
  const pins = [
    { x: 250, y: 190, day: "24", month: "NOV" },
    { x: 610, y: 150, day: "29", month: "NOV" },
    { x: 760, y: 420, day: "03", month: "DEZ" },
    { x: 380, y: 470, day: "12", month: "DEZ" },
  ];
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid slice" className="pointer-events-none absolute inset-0 h-full w-full">
      <g className="fill-emerald-500/[.12] dark:fill-emerald-400/[.07]">
        <path d="M80 60c60-20 140 10 150 70s-40 110-110 100S20 160 30 120s20-50 50-60Z" />
        <path d="M640 300c50-30 140-10 160 40s-20 100-90 104-120-24-120-70 10-50 50-74Z" />
        <path d="M860 40c40 0 90 30 80 70s-60 50-100 40-40-110 20-110Z" />
      </g>
      <path d="M0 520C160 470 300 520 420 600" className="stroke-sky-500/[.18]" strokeWidth="26" fill="none" strokeLinecap="round" />
      <g className="stroke-foreground/[.09]" fill="none" strokeLinecap="round">
        <path d="M-20 260C200 230 420 280 620 250S880 200 1020 230" strokeWidth="9" />
        <path d="M300 -20C330 160 280 360 340 660" strokeWidth="9" />
        <path d="M720 -20C690 180 760 400 700 660" strokeWidth="7" />
      </g>
      <g className="stroke-foreground/[.06]" fill="none" strokeWidth="2.5">
        <path d="M0 110h1000M0 380h1000M0 560h1000M120 0v640M480 0v640M560 0v640M880 0v640" />
        <path d="M0 40l440 600M520 0l480 420M140 640L700 0" />
      </g>
      <g className="opacity-40 blur-[1.5px] dark:opacity-30">
        {pins.map((pin) => (
          <g key={pin.day + pin.month} transform={`translate(${pin.x - 20} ${pin.y - 48})`}>
            <path d="M15 37 20 44.5 25 37Z" fill="#2455FF" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
            <rect x="2" y="2" width="36" height="36" rx="10" fill="#2455FF" stroke="#fff" strokeWidth="2" />
            <text x="20" y="15.5" textAnchor="middle" fontFamily="Arial,Helvetica,sans-serif" fontSize="8.5" fontWeight="700" fill="#fff" opacity=".85">{pin.month}</text>
            <text x="20" y="31" textAnchor="middle" fontFamily="Arial,Helvetica,sans-serif" fontSize="15" fontWeight="800" fill="#fff">{pin.day}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/** Opt-in state of the home map: nothing loads from Google until the visitor chooses "Ativar Google Maps". */
export function MapConsentCard() {
  const { enableMaps } = useGoogleMaps();
  return (
    <section aria-label="Ativar mapa opcional" className="relative isolate flex h-full min-h-0 overflow-y-auto overflow-x-hidden bg-muted px-4 py-5 md:min-h-[420px] md:p-8">
      <GhostMap />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--muted)/0.55),transparent_70%)]" />
      <div className="relative m-auto w-full max-w-[26rem] rounded-[22px] border border-black/[.06] bg-card p-6 text-card-foreground shadow-[0_1px_2px_rgba(16,21,31,.06),0_14px_28px_-14px_rgba(16,21,31,.22),0_40px_80px_-32px_rgba(16,21,31,.42)] dark:border-white/10 sm:p-7">
        <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-2xl bg-cta text-cta-foreground shadow-sm"><MapIcon className="h-6 w-6" /></span>
        <h2 className="mt-4 text-2xl font-bold tracking-tight">Explore pelo <span className="text-[#4E7A00] dark:text-cta">mapa</span></h2>
        <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
          <p>O mapa é opcional. Ao ativar, seu navegador se conecta ao Google, que recebe dados técnicos como IP e as buscas de endereços que você fizer.</p>
          <p>Sua localização só é pedida quando você escolher usá-la. A escolha vale apenas nesta aba e não guarda coordenadas.</p>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="button" onClick={enableMaps} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-cta px-5 text-sm font-semibold text-cta-foreground shadow-[0_6px_16px_-8px_rgba(120,160,0,.9)] transition-colors hover:bg-cta/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card">Ativar Google Maps <ArrowRight aria-hidden="true" className="h-4 w-4" /></button>
          <Link href="/privacidade#preferencias" className="inline-flex min-h-11 items-center rounded-lg text-sm font-medium text-brand underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Privacidade e preferências</Link>
        </div>
        <p className="mt-4 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">Você pode continuar pela lista, buscando e filtrando os eventos, sem ativar o mapa.</p>
      </div>
    </section>
  );
}
