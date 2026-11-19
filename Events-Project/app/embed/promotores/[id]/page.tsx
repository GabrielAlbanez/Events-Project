import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPromoterPublicAgenda } from "@/lib/services/promoters";
import { profileMediaUrl } from "@/lib/profileMediaUrl";
import { publicSiteUrl } from "@/lib/publicUrl";
import styles from "../../embed.module.css";

export const dynamic = "force-dynamic";

type Props = { params: { id: string } };

const EMBED_LIMIT = 8;

function siteOrigin(): string {
  try { return publicSiteUrl().origin; } catch { return ""; }
}

/** Partes da data sem conversão de fuso: dataInicio já é a data local do evento (YYYY-MM-DD). */
function dateParts(value: string): { day: string; month: string; label: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return { day: "--", month: "", label: "Data a confirmar" };
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return {
    day: match[3],
    month: new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(date).replace(".", ""),
    label: new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(date),
  };
}

function priceLabel(isFree: boolean, priceCents: number): string {
  if (isFree) return "Grátis";
  return priceCents > 0 ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(priceCents / 100) : "";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const agenda = await getPromoterPublicAgenda(params.id, { limit: 1 }).catch(() => null);
  return { title: agenda ? `Agenda de ${agenda.promoter.name || "organizador"}` : "Agenda indisponível", robots: { index: false, follow: false } };
}

/** Widget incorporável: lista compacta dos próximos eventos publicados do organizador. */
export default async function PromoterEmbed({ params }: Props) {
  const agenda = await getPromoterPublicAgenda(params.id, { limit: EMBED_LIMIT });
  if (!agenda) notFound();
  const origin = siteOrigin();
  const name = agenda.promoter.name || "Organizador";
  const avatar = profileMediaUrl(agenda.promoter.image);
  const promoterUrl = `${origin}/promotores/${encodeURIComponent(agenda.promoter.id)}`;

  return (
    <div className={styles.inner}>
      <header className={styles.header}>
        {avatar ? <img src={avatar} alt="" className={styles.avatar} width={40} height={40} /> : <span className={styles.avatarFallback} aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>}
        <div>
          <p className={styles.eyebrow}>Próximos eventos</p>
          <h1 className={styles.title}>{name}</h1>
        </div>
      </header>

      {agenda.upcoming.length === 0 ? (
        <p className={styles.empty}>Nenhum evento publicado no momento. Volte em breve.</p>
      ) : (
        <ul className={styles.list}>
          {agenda.upcoming.map(event => {
            const date = dateParts(event.dataInicio);
            const price = priceLabel(event.isFree, event.priceCents);
            return (
              <li key={event.id}>
                <a href={`${origin}/eventos/${encodeURIComponent(event.id)}`} target="_blank" rel="noopener noreferrer" className={styles.item}>
                  <span className={styles.date} aria-hidden="true"><span className={styles.day}>{date.day}</span><span className={styles.month}>{date.month}</span></span>
                  <span className={styles.body}>
                    <span className={styles.name}>{event.nome}</span>
                    <span className={styles.meta}>{date.label}{event.startTime ? ` · ${event.startTime}` : ""}{event.endereco ? ` · ${event.endereco}` : ""}</span>
                  </span>
                  {price && <span className={styles.price}>{price}</span>}
                  <span className="sr-only"> (abre em nova aba)</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}

      <footer className={styles.footer}>
        <a href={promoterUrl} target="_blank" rel="noopener noreferrer">Ver todos no EventMap<span className="sr-only"> (abre em nova aba)</span></a>
        <a href={`${origin}/api/promotores/${encodeURIComponent(agenda.promoter.id)}/calendar.ics`} target="_blank" rel="noopener noreferrer">Adicionar à agenda (ICS)<span className="sr-only"> (abre em nova aba)</span></a>
      </footer>
    </div>
  );
}
