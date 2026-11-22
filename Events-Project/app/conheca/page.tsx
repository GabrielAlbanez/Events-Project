import type { Metadata } from "next";
import { AudienceSwitch } from "@/components/MyComponents/landing/AudienceSwitch";
import { FAQ_ITEMS, FaqSection, FinalCta } from "@/components/MyComponents/landing/LandingClosing";
import { LandingChapter } from "@/components/MyComponents/landing/LandingChapter";
import { LandingHero } from "@/components/MyComponents/landing/LandingHero";
import { MapPlayground } from "@/components/MyComponents/landing/MapPlayground";
import { PhoneJourney } from "@/components/MyComponents/landing/PhoneJourney";
import { ScrollProgress } from "@/components/MyComponents/landing/ScrollProgress";
import { ShowcaseDepth } from "@/components/MyComponents/landing/ShowcaseDepth";
import styles from "@/components/MyComponents/landing/Landing.module.css";
import { publicSiteUrl } from "@/lib/publicUrl";

const TITLE = "Como funciona o EventMap — descubra, participe e viva cada evento";
const DESCRIPTION = "Veja como o EventMap funciona: encontre eventos perto de você no mapa, salve, receba lembretes, confirme presença ou compre o ingresso por Pix e entre com seu QR Code.";
const OG_IMAGE = { url: "/landing/descoberta-mapa.jpg", width: 2000, height: 1280, alt: "Descoberta de eventos no mapa do EventMap" };

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
      "Aprovação de inscrições pelo organizador",
      "Cupons de desconto nos ingressos",
      "Kit de divulgação com imagem para compartilhar",
      "Destaque pago sinalizado",
      "Importação automática de eventos de fontes oficiais",
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
      <ScrollProgress />
      <LandingHero />
      <LandingChapter
        id="descobrir"
        index={1}
        label="Descobrir"
        title="Monte a sua noite em três toques."
        lead="Escolha o que curte, até onde quer ir e quando. No EventMap, o mapa e a lista respondem na hora — experimente aqui."
      >
        <MapPlayground />
      </LandingChapter>
      <LandingChapter
        id="participar"
        index={2}
        label="Participar"
        title="Do salvar ao check-in, no seu celular."
        lead="Toque no celular para viver o caminho completo: salvar, garantir o lugar, pagar por Pix e entrar com QR Code."
        tone="muted"
      >
        <PhoneJourney />
      </LandingChapter>
      <LandingChapter
        id="por-dentro"
        index={3}
        label="Por dentro"
        title="A interface de verdade."
        lead="Capturas do EventMap como ele é hoje, no computador e no celular."
        tone="night"
      >
        <ShowcaseDepth />
      </LandingChapter>
      <LandingChapter
        id="organizar"
        index={4}
        label="Organizar"
        title="Dois lados do mesmo evento."
        lead="Quem vai encontra, participa e chega. Quem organiza publica, vende, aprova e acompanha cada resultado."
      >
        <AudienceSwitch />
      </LandingChapter>
      <FaqSection />
      <FinalCta />
    </div>
  );
}
