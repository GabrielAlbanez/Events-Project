import type { Metadata } from "next";
import PortfolioDemo from "@/components/MyComponents/PortfolioDemo";
import { createDemoEvents } from "@/lib/demoEvents";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Demonstração guiada",
  description: "Explore o EventMap com eventos fictícios em uma simulação local, sem criar conta.",
  robots: { index: false, follow: true },
};

export default function DemonstracaoPage() {
  return <PortfolioDemo events={createDemoEvents(new Date())} />;
}
