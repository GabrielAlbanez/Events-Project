"use client";

import { SessionProvider } from "next-auth/react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/ui/app-sidebar";
import GoogleMapsLoader from "@/components/MyComponents/GoogleMapsLoader";
import { HeroUIProvider } from "@heroui/react";
import { SocketProvider } from "@/context/SocketContext";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export default function ClientProviders({
  children,
  defaultOpen,
}: {
  children: React.ReactNode;
  defaultOpen: boolean;
}) {
  return (
    <SessionProvider>
      <SocketProvider>
        <HeroUIProvider>
          <NextThemesProvider attribute="class" defaultTheme="light">
            <SidebarProvider defaultOpen={defaultOpen}>
              <div className="flex z-50 w-full h-screen">
                {/* Sidebar */}
                <AppSidebar />
                {/* Conteúdo Principal */}
                <main className="flex-1 z-10 overflow-auto text-foreground bg-background ">
                  {/* Carregamento global do Google Maps */}
                  <GoogleMapsLoader>{children}</GoogleMapsLoader>
                </main>
              </div>
            </SidebarProvider>
          </NextThemesProvider>
        </HeroUIProvider>
      </SocketProvider>
    </SessionProvider>
  );
}
