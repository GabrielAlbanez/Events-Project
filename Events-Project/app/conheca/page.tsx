import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { AudienceSwitch } from "@/components/MyComponents/landing/AudienceSwitch";
import { FAQ_ITEMS, FaqSection, FinalCta } from "@/components/MyComponents/landing/LandingClosing";
import { LandingChapter } from "@/components/MyComponents/landing/LandingChapter";
import { LandingHero } from "@/components/MyComponents/landing/LandingHero";
import { LiveAgenda } from "@/components/MyComponents/landing/LiveAgenda";
import { MapPlayground } from "@/components/MyComponents/landing/MapPlayground";
import { PhoneJourney } from "@/components/MyComponents/landing/PhoneJourney";
import { ScrollProgress } from "@/components/MyComponents/landing/ScrollProgress";
import { ScrollSequence } from "@/components/MyComponents/landing/ScrollSequence";
import { ShowcaseDepth } from "@/components/MyComponents/landing/ShowcaseDepth";
import styles from "@/components/MyComponents/landing/Landing.module.css";
import { buildLandingCatalog, summarizeCatalog, type CatalogSummary, type LandingCatalogSource } from "@/components/MyComponents/landing/landingData";
import { listPublicCatalog } from "@/lib/eventQueries";
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

/*
 * Agenda real na landing. O layout raiz lê cookies, então a rota já é dinâmica e `export const revalidate`
 * não teria efeito aqui: o resumo do catálogo fica em unstable_cache por 10 minutos, então o banco é lido no
 * máximo uma vez a cada 10 minutos. Um tempo limite protege o primeiro byte; sem banco, entra o conteúdo de exemplo.
 */
const CATALOG_TIMEOUT_MS = 2500;
const CATALOG_REVALIDATE_SECONDS = 600;

const loadCatalogSummary = unstable_cache(
  async (): Promise<CatalogSummary> => {
    const events = await listPublicCatalog();
    const rows: LandingCatalogSource[] = events.map(event => ({
      id: event.id,
      nome: event.nome,
      banner: event.banner,
      category: event.category,
      dataInicio: event.dataInicio,
      dataFim: event.dataFim,
      startTime: event.startTime,
      endereco: event.endereco,
      isFree: event.isFree,
      priceCents: event.priceCents,
      validate: event.validate,
      status: event.status,
    }));
    return summarizeCatalog(rows, new Date());
  },
  ["conheca-landing-catalog-v1"],
  { revalidate: CATALOG_REVALIDATE_SECONDS },
);

async function loadLandingSummary(): Promise<CatalogSummary | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      loadCatalogSummary(),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), CATALOG_TIMEOUT_MS); }),
    ]);
  } catch {
    // Banco indisponível: a landing segue completa com o conteúdo de exemplo.
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const jsonLd = (value: object) => ({ __html: JSON.stringify(value).replace(/</g, "\\u003c") });

export default async function ConhecaPage() {
  const catalog = buildLandingCatalog(await loadLandingSummary());
  // Evento real em destaque na cena do mapa ao ingresso: o mais próximo com banner utilizável (a agenda já vem ordenada).
  const featuredSource = catalog.real ? catalog.events.find(event => event.href && event.image) ?? null : null;
  const featured = featuredSource?.href
    ? { id: featuredSource.id, href: featuredSource.href, name: featuredSource.name, category: featuredSource.category, image: featuredSource.image, dateLabel: featuredSource.dateLabel, priceLabel: featuredSource.priceLabel, place: featuredSource.place }
    : null;
  return (
    <div className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(structuredData())} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(faqStructuredData())} />
      <ScrollProgress />
      <LandingHero events={catalog.events} real={catalog.real} />
      <LiveAgenda catalog={catalog} />
      <ScrollSequence featured={featured} />
      <LandingChapter
        id="descobrir"
        index={1}
        label="Descobrir"
        title="Monte a sua noite em três toques."
        lead={catalog.real
          ? "Escolha a categoria, a distância e o preço. Os eventos abaixo vêm da agenda do EventMap — experimente filtrar."
          : "Escolha a categoria, a distância e o preço. No EventMap, o mapa e a lista respondem na hora — experimente aqui."}
      >
        <MapPlayground events={catalog.events} real={catalog.real} />
      </LandingChapter>
      <LandingChapter
        id="participar"
        index={2}
        label="Participar"
        title="Do salvar ao check-in, no seu celular."
        lead="Toque no celular para viver o caminho completo: salvar, garantir o lugar, pagar por Pix e entrar com QR Code."
        tone="muted"
      >
        <PhoneJourney events={catalog.events} real={catalog.real} />
      </LandingChapter>
      <LandingChapter
        id="por-dentro"
        index={3}
        label="Por dentro"
        title="A interface de verdade."
        lead="Capturas do EventMap como ele é hoje, no computador e no celular."
        tone="stage"
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
        <AudienceSwitch promoEvent={catalog.real ? catalog.events[0] : null} />
      </LandingChapter>
      <FaqSection />
      <FinalCta />
    </div>
  );
}
