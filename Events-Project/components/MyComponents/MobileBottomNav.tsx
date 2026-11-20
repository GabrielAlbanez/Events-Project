"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { CalendarDays, Compass, Map as MapIcon, UserRound, type LucideIcon } from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";

/**
 * Telas que já ocupam a base da tela no celular ficam sem a barra:
 * página do evento (barra própria de ação), chats e conversas, check-in, salas e administração.
 */
export function showsMobileBottomNav(pathname: string | null): boolean {
  if (!pathname) return false;
  return !/^\/(eventos|embed|admin|salas\/[^/]+|myEvents\/[^/]+\/checkin)(\/|$)/.test(pathname);
}

type NavItem = { label: string; href: string; icon: LucideIcon; current: boolean; onClick?: (event: MouseEvent<HTMLAnchorElement>) => void };

const isPlainClick = (event: MouseEvent<HTMLAnchorElement>) => !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0;

/** Navegação principal do celular (abaixo de md), fixa na base e acima da área segura. */
export function MobileBottomNav() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [mapActive, setMapActive] = useState(false);
  const authenticated = status === "authenticated" && Boolean(session?.user?.id);

  // Mesmo critério do cabeçalho: na home, o mapa é a âncora #home-discovery.
  useEffect(() => {
    const sync = () => setMapActive(pathname === "/" && ["#home-discovery", "#home-discovery-search"].includes(window.location.hash));
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    window.addEventListener("eventmap:discovery", sync);
    window.addEventListener("eventmap:home", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
      window.removeEventListener("eventmap:discovery", sync);
      window.removeEventListener("eventmap:home", sync);
    };
  }, [pathname]);

  // Já na home, rola até o topo ou até o mapa sem recarregar (a home escuta estes eventos).
  const openHome = (event: MouseEvent<HTMLAnchorElement>) => {
    if (pathname !== "/" || !isPlainClick(event)) return;
    event.preventDefault();
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    setMapActive(false);
    window.dispatchEvent(new Event("eventmap:home"));
  };
  const openMap = (event: MouseEvent<HTMLAnchorElement>) => {
    if (pathname !== "/" || !isPlainClick(event)) return;
    event.preventDefault();
    const url = new URL(window.location.href);
    url.hash = "home-discovery";
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    setMapActive(true);
    window.dispatchEvent(new CustomEvent("eventmap:discovery", { detail: { focusSearch: false } }));
  };

  if (!showsMobileBottomNav(pathname)) return null;

  const accountHref = authenticated ? "/Profile" : "/login";
  const items: NavItem[] = [
    { label: "Descobrir", href: "/", icon: Compass, current: pathname === "/" && !mapActive, onClick: openHome },
    { label: "Agenda", href: "/EventsCreated", icon: CalendarDays, current: pathname === "/EventsCreated" },
    { label: "Mapa", href: "/#home-discovery", icon: MapIcon, current: pathname === "/" && mapActive, onClick: openMap },
    { label: "Conta", href: accountHref, icon: UserRound, current: authenticated ? pathname === "/Profile" : pathname === "/login" || pathname === "/register" },
  ];

  return <nav aria-label="Navegação rápida" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_hsl(var(--foreground)/0.06)] md:hidden">
    <ul className="mx-auto grid h-16 max-w-md grid-cols-4 px-2">
      {items.map(({ label, href, icon: Icon, current, onClick }) => <li key={label} className="flex">
        <Link href={href} onClick={onClick} aria-current={current ? "page" : undefined} className={`group flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none ${current ? "text-brand" : "text-muted-foreground hover:text-foreground"}`}>
          <span aria-hidden="true" className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors motion-reduce:transition-none ${current ? "bg-brand/10" : ""}`}><Icon className="h-5 w-5" strokeWidth={current ? 2.3 : 2} /></span>
          <span className={current ? "font-semibold" : undefined}>{label}</span>
        </Link>
      </li>)}
    </ul>
  </nav>;
}
