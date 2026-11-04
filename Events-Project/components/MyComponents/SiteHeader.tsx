"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Search, UserRound } from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { BrandLogo } from "./BrandLogo";
import styles from "./SiteHeader.module.css";

export function SiteHeader() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { setOpen, setOpenMobile } = useSidebar();
  const [mapActive, setMapActive] = useState(false);
  const authenticated = status === "authenticated" && Boolean(session?.user?.id);

  useEffect(() => {
    const sync = () => setMapActive(pathname === "/" && ["#home-discovery", "#home-discovery-search"].includes(window.location.hash));
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => { window.removeEventListener("hashchange", sync); window.removeEventListener("popstate", sync); };
  }, [pathname]);

  const closeMenu = () => { setOpen(false); setOpenMobile(false); };
  const isPlainClick = (event: MouseEvent<HTMLAnchorElement>) => !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0;
  const openHome = (event: MouseEvent<HTMLAnchorElement>) => {
    if (pathname !== "/" || !isPlainClick(event)) return;
    event.preventDefault();
    closeMenu();
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    setMapActive(false);
    window.dispatchEvent(new Event("eventmap:home"));
  };
  const openDiscovery = (event: MouseEvent<HTMLAnchorElement>, focusSearch = false) => {
    if (pathname !== "/" || !isPlainClick(event)) return;
    event.preventDefault();
    closeMenu();
    const url = new URL(window.location.href);
    url.hash = focusSearch ? "home-discovery-search" : "home-discovery";
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    setMapActive(true);
    window.dispatchEvent(new CustomEvent("eventmap:discovery", { detail: { focusSearch } }));
  };

  return <header className={styles.header} data-site-navigation>
    <div className={styles.inner}>
      <div className={styles.brandGroup}>
        <SidebarTrigger className={styles.menu} aria-label="Abrir menu de navegação" title="Abrir menu de navegação" />
        <Link href="/" className={styles.brand} onClick={openHome} aria-label="EventMap — início"><BrandLogo priority /></Link>
      </div>
      <nav className={styles.navigation} aria-label="Navegação principal">
        <Link href="/" onClick={openHome} aria-current={pathname === "/" && !mapActive ? "page" : undefined}>Descobrir</Link>
        <Link href="/EventsCreated" aria-current={pathname === "/EventsCreated" ? "page" : undefined}>Agenda</Link>
        <Link href="/#home-discovery" onClick={event => openDiscovery(event)} aria-current={pathname === "/" && mapActive ? "location" : undefined}>Mapa</Link>
      </nav>
      <div className={styles.actions}>
        <Link href="/#home-discovery-search" onClick={event => openDiscovery(event, true)} className={styles.search} aria-label="Buscar eventos no mapa" title="Buscar eventos"><Search size={20} aria-hidden="true" /></Link>
        {status === "loading" ? <span className={styles.accountLoading} role="status" aria-label="Carregando conta" /> : authenticated ? <Link href="/Profile" className={styles.account}><UserRound size={18} aria-hidden="true" /><span>Minha conta</span></Link> : <>
          <a href="/login" onClick={closeMenu} className={styles.login} aria-label="Entrar na plataforma"><UserRound size={18} aria-hidden="true" /><span>Entrar</span></a>
          <a href="/register" onClick={closeMenu} className={styles.signup}>Criar conta</a>
        </>}
      </div>
    </div>
  </header>;
}
