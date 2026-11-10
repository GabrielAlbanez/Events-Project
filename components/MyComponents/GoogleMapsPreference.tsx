"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGoogleMaps } from "./GoogleMapsLoader";

export function GoogleMapsPreference({ compact = false }: { compact?: boolean }) {
  const { enabled, configured, enableMaps, disableMaps } = useGoogleMaps();
  const pathname = usePathname();
  return (
    <div className={compact ? "space-y-2 text-sm" : "flex flex-col items-start gap-4 text-sm leading-6"}>
      <p className="text-muted-foreground">
        {enabled
          ? "Google Maps e busca de endereços estão ativados nesta aba."
          : "O mapa e as sugestões de endereços são opcionais. Ao ativar, seu navegador se conecta ao Google, que recebe dados técnicos como IP e as buscas de endereços que você fizer."}
      </p>
      {!compact && <p className="text-muted-foreground">Sua localização só é solicitada quando você escolher usá-la. Ela é enviada ao Google para exibir sua posição ou calcular trajetos. A escolha de ativar o mapa dura nesta aba; não guardamos coordenadas nessa preferência.</p>}
      {configured ? <button
        type="button"
        onClick={enabled ? disableMaps : enableMaps}
        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >{enabled ? "Desativar Google Maps" : "Ativar Google Maps"}</button> : <p role="status" className="text-muted-foreground">Google Maps indisponível. Você pode continuar pela lista ou digitar o endereço.</p>}
      {enabled && <p className="text-xs leading-5 text-muted-foreground">Desativar recarrega esta página; salve alterações em formulários antes. As permissões de localização do navegador são gerenciadas separadamente.</p>}
      {!compact && pathname !== "/privacidade" && <Link href="/privacidade#preferencias" className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4">Privacidade e preferências</Link>}
    </div>
  );
}
