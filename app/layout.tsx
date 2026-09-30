import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { cookies } from "next/headers";
import ClientProviders from "@/components/Providers/ClientProviders";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: {
    default: "EventMap — descubra experiências perto de você",
    template: "%s | EventMap",
  },
  description: "Encontre eventos, explore novos lugares e viva experiências que combinam com você.",
  applicationName: "EventMap",
  keywords: ["eventos", "agenda", "mapa", "experiências", "São Paulo"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = cookies();
  const defaultOpen = cookieStore.get("sidebar:state")?.value === "true";

  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body>
        <ClientProviders defaultOpen={defaultOpen}>
          <ToastContainer  position="top-right" autoClose={3000} />
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
