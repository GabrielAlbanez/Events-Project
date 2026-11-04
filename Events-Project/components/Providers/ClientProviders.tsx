"use client";

import { SessionProvider } from "next-auth/react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/ui/app-sidebar";
import GoogleMapsLoader from "@/components/MyComponents/GoogleMapsLoader";
import { HeroUIProvider } from "@heroui/system";
import { SocketProvider } from "@/context/SocketContext";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import NotificationBell from "@/components/MyComponents/NotificationBell";
import ImpersonationGuard from "@/components/MyComponents/ImpersonationGuard";
import { SiteHeader } from "@/components/MyComponents/SiteHeader";
import siteStyles from "@/components/MyComponents/SiteHeader.module.css";

export default function ClientProviders({
  children,
  defaultOpen,
}: {
  children: React.ReactNode;
  defaultOpen: boolean;
}) {
  const content = (
      <SocketProvider>
        <HeroUIProvider>
          <NextThemesProvider attribute="class" defaultTheme="light">
            <ImpersonationGuard>
            <SidebarProvider defaultOpen={defaultOpen}>
              <div className="flex min-h-screen w-full">
                {/* Sidebar */}
                <AppSidebar />
                <NotificationBell />
                {/* Conteúdo Principal */}
                <main className={`${siteStyles.shell} relative z-10`}>
                  <SiteHeader />
                  {/* Carregamento global do Google Maps */}
                  <div className={siteStyles.content}><GoogleMapsLoader>{children}</GoogleMapsLoader></div>
                </main>
              </div>
            </SidebarProvider>
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
