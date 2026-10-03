"use client";

import { SessionProvider } from "next-auth/react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/ui/app-sidebar";
import GoogleMapsLoader from "@/components/MyComponents/GoogleMapsLoader";
import { HeroUIProvider } from "@heroui/system";
import { SocketProvider } from "@/context/SocketContext";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import NotificationBell from "@/components/MyComponents/NotificationBell";

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
            <SidebarProvider defaultOpen={defaultOpen}>
              <div className="flex min-h-screen w-full">
                {/* Sidebar */}
                <AppSidebar />
                <NotificationBell />
                {/* Conteúdo Principal */}
                <main className="relative z-10 min-w-0 flex-1 overflow-auto bg-background/70 text-foreground backdrop-blur-[2px]">
                  {/* Carregamento global do Google Maps */}
                  <GoogleMapsLoader>{children}</GoogleMapsLoader>
                </main>
              </div>
            </SidebarProvider>
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
