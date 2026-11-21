import type { Metadata } from "next";
import { LandingHero } from "@/components/MyComponents/landing/LandingHero";
import { DemoSection, JourneySection, ProblemSection } from "@/components/MyComponents/landing/LandingStory";
import { ComparisonSection, OrganizersSection, ParticipantsSection, PlansSection } from "@/components/MyComponents/landing/LandingBusiness";
import { FAQ_ITEMS, FaqSection, FinalCta, LandingFooter } from "@/components/MyComponents/landing/LandingClosing";
import styles from "@/components/MyComponents/landing/Landing.module.css";
import { publicSiteUrl } from "@/lib/publicUrl";

const TITLE = "EventMap — a cidade ao vivo, do mapa à porta do evento";
const DESCRIPTION = "Descubra eventos no mapa e viva a experiência completa: comunidade, chat, conexões e check-in por QR em um só lugar. Funciona com a bilheteria que você já usa.";
const OG_IMAGE = { url: "/landing/agenda.jpg", width: 1860, height: 1185, alt: "Agenda de eventos do EventMap" };

function siteBase(): URL | undefined {
  try { return publicSiteUrl(); } catch { return undefined; }
}

export function generateMetadata(): Metadata {
  return {
    metadataBase: siteBase(),
    title: { absolute: TITLE },
    description: DESCRIPTION,
    keywords: ["eventos", "plataforma para organizadores", "check-in QR", "comunidade de eventos", "mapa de eventos", "lista de espera", "agenda cultural"],
    alternates: { canonical: "/produto" },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: "EventMap",
      url: "/produto",
      title: TITLE,
      description: DESCRIPTION,
      images: [OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_IMAGE.url] },
    robots: { index: true, follow: true },
  };
}

function structuredData() {
  const base = siteBase();
  const url = base ? new URL("/produto", base).href : undefined;
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "EventMap",
    applicationCategory: "LifestyleApplication",
    operatingSystem: "Web",
    inLanguage: "pt-BR",
    description: DESCRIPTION,
    ...(url ? { url } : {}),
    ...(base ? { image: new URL(OG_IMAGE.url, base).href } : {}),
    featureList: [
      "Mapa de eventos com filtro por raio e tempo de deslocamento",
      "Agenda, calendário e exportação .ics",
      "Favoritos, lembretes e notificações push",
      "Salas com amigos com votação",
      "Comunidade do evento com comunicados, enquetes e filas virtuais",
      "Chat dos participantes em tempo real",
      "Conexões entre participantes com opt-in",
      "Inscrição com capacidade e lista de espera automática",
      "Check-in por QR",
      "Painel de resultados para organizadores",
    ],
  };
}

function faqStructuredData() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map(item => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

const jsonLd = (value: object) => ({ __html: JSON.stringify(value).replace(/</g, "\\u003c") });

export default function ProdutoPage() {
  return (
    <div className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(structuredData())} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(faqStructuredData())} />
      <LandingHero />
      <ProblemSection />
      <DemoSection />
      <JourneySection />
      <OrganizersSection />
      <ParticipantsSection />
      <ComparisonSection />
      <PlansSection />
      <FaqSection />
      <FinalCta />
      <LandingFooter />
    </div>
  );
}
