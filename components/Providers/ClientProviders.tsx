"use client";

import { SessionProvider } from "next-auth/react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/ui/app-sidebar";
import GoogleMapsLoader from "@/components/MyComponents/GoogleMapsLoader";
import { NextUIProvider } from "@nextui-org/react";
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
      <NextUIProvider>
        <NextThemesProvider attribute="class" defaultTheme="dark">
          <SidebarProvider defaultOpen={defaultOpen}>
            <div className="flex z-50 w-full h-screen">
              {/* Sidebar */}
              <AppSidebar />

              {/* Conteúdo Principal */}
              <main className="flex-1 z-10 overflow-auto dark text-foreground bg-background ">
                {/* Carregamento global do Google Maps */}
                <GoogleMapsLoader>{children}</GoogleMapsLoader>
              </main>
            </div>
          </SidebarProvider>
        </NextThemesProvider>
      </NextUIProvider>
    </SessionProvider>
  );
}
