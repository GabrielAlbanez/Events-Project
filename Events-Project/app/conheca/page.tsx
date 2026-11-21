import type { Metadata } from "next";
import { LandingHero } from "@/components/MyComponents/landing/LandingHero";
import { ShowcaseSection, StepsSection } from "@/components/MyComponents/landing/LandingStory";
import { FAQ_ITEMS, FaqSection, FinalCta, OrganizersSection } from "@/components/MyComponents/landing/LandingClosing";
import styles from "@/components/MyComponents/landing/Landing.module.css";
import { publicSiteUrl } from "@/lib/publicUrl";

const TITLE = "Como funciona o EventMap — descubra, participe e viva cada evento";
const DESCRIPTION = "Veja como o EventMap funciona: encontre eventos perto de você no mapa, salve, receba lembretes, confirme presença ou compre o ingresso por Pix e entre com seu QR Code.";
const OG_IMAGE = { url: "/landing/agenda.jpg", width: 1860, height: 1185, alt: "Agenda de eventos do EventMap" };

function siteBase(): URL | undefined {
  try { return publicSiteUrl(); } catch { return undefined; }
}

export function generateMetadata(): Metadata {
  return {
    metadataBase: siteBase(),
    title: { absolute: TITLE },
    description: DESCRIPTION,
    keywords: ["como funciona o EventMap", "eventos perto de mim", "mapa de eventos", "agenda cultural", "ingresso por Pix", "check-in QR", "comunidade de eventos"],
    alternates: { canonical: "/conheca" },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: "EventMap",
      url: "/conheca",
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
  const url = base ? new URL("/conheca", base).href : undefined;
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
      "Mapa de eventos com filtro por distância e tempo de deslocamento",
      "Agenda em lista ou calendário, com exportação para o calendário",
      "Favoritos, lembretes e notificações",
      "Confirmação de presença com lotação e lista de espera",
      "Venda de ingressos por Pix via Mercado Pago",
      "Comunidade e chat do evento",
      "Conexões entre participantes com opt-in",
      "Check-in por QR Code",
      "Página de resultados para organizadores",
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

export default function ConhecaPage() {
  return (
    <div className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(structuredData())} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(faqStructuredData())} />
      <LandingHero />
      <StepsSection />
      <ShowcaseSection />
      <OrganizersSection />
      <FaqSection />
      <FinalCta />
    </div>
  );
}
