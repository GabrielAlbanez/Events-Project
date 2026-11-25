"use client";

import { SessionProvider } from "next-auth/react";
import { usePathname } from "next/navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/ui/app-sidebar";
import GoogleMapsLoader from "@/components/MyComponents/GoogleMapsLoader";
import { HeroUIProvider } from "@heroui/system";
import { SocketProvider } from "@/context/SocketContext";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import ImpersonationGuard from "@/components/MyComponents/ImpersonationGuard";
import { SiteHeader } from "@/components/MyComponents/SiteHeader";
import { SiteFooter } from "@/components/MyComponents/SiteFooter";
import siteStyles from "@/components/MyComponents/SiteHeader.module.css";
import { MobileBottomNav, showsMobileBottomNav } from "@/components/MyComponents/MobileBottomNav";
import InstallAppProvider from "@/components/Providers/InstallAppProvider";

/** Widgets incorporáveis (/embed/**) rodam sozinhos dentro de um iframe, sem a estrutura do site. */
export function isEmbedPath(pathname: string | null): boolean {
  return Boolean(pathname && pathname.startsWith("/embed/"));
}

/**
 * Telas de altura total (descoberta com mapa na home e chat do evento) terminam exatamente no fim da tela.
 * Um rodapé depois delas empurraria o topo para baixo do cabeçalho fixo.
 */
export function showsSiteFooter(pathname: string | null): boolean {
  if (!pathname) return true;
  return pathname !== "/" && !/^\/eventos\/[^/]+\/chat\/?$/.test(pathname);
}

export default function ClientProviders({
  children,
  defaultOpen,
}: {
  children: React.ReactNode;
  defaultOpen: boolean;
}) {
  const pathname = usePathname();
  const mobileNav = showsMobileBottomNav(pathname);

  // Sem sessão, socket, Google Maps, menu, cabeçalho, sino, rodapé nem guarda de impersonação:
  // o widget é público, tem tema próprio e não deve abrir conexões em nome do visitante do site parceiro.
  if (isEmbedPath(pathname)) return <>{children}</>;

  const content = (
      <SocketProvider>
        <HeroUIProvider>
          <NextThemesProvider attribute="class" defaultTheme="light">
            <ImpersonationGuard>
            <InstallAppProvider>
            <SidebarProvider defaultOpen={defaultOpen}>
              <div className="flex min-h-screen w-full">
                {/* Primeiro foco da página: leva direto ao conteúdo, pulando menu e cabeçalho. */}
                <a href="#conteudo" className={siteStyles.skipLink}>Pular para o conteúdo</a>
                {/* Sidebar */}
                <AppSidebar />
                {/* Conteúdo Principal */}
                <div className={`${siteStyles.shell} relative z-10`} data-mobile-nav={mobileNav || undefined}>
                  <SiteHeader />
                  {/* Único landmark principal; as páginas usam div/section dentro dele. */}
                  <main id="conteudo" tabIndex={-1} className={siteStyles.content}><GoogleMapsLoader>{children}</GoogleMapsLoader></main>
                  {/* Rodapé global; reserva espaço extra quando a barra fixa de ação do evento está visível no mobile. */}
                  {showsSiteFooter(pathname) && <SiteFooter className="bg-background pb-[calc(1.5rem+var(--event-cta-space,0px))] xl:pb-6" />}
                  {/* Reserva a altura da barra inferior do celular (zero no desktop e onde ela não aparece). */}
                  {mobileNav && <div aria-hidden="true" className={siteStyles.mobileNavSpacer} />}
                </div>
                <MobileBottomNav />
              </div>
            </SidebarProvider>
            </InstallAppProvider>
            </ImpersonationGuard>
          </NextThemesProvider>
        </HeroUIProvider>
      </SocketProvider>
  );

  return (
    <SessionProvider>
      {content}
    </SessionProvider>
  );
}
