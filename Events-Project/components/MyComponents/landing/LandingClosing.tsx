import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Screenshot } from "./DeviceFrames";
import styles from "./Landing.module.css";

export function OrganizersSection() {
  return (
    <section id="organizadores" className={cn(styles.section, styles.organizers)} aria-labelledby="organizadores-titulo">
      <div className={cn(styles.container, styles.bandGrid)}>
        <div className={styles.bandCopy}>
          <p className={styles.kicker}>Para organizadores</p>
          <h2 id="organizadores-titulo" className={styles.h2}>Publique, venda e acompanhe cada resultado.</h2>
          <p className={styles.bodyLarge}>
            Inscrições com lista de espera, ingressos por Pix na sua conta Mercado Pago, check-in com a equipe e um funil que vai da visualização à portaria.
          </p>
          <Link href="/para-organizadores" className={styles.textLink}>
            Conheça o EventMap para{" "}
            <span className={styles.nowrap}>organizadores<ArrowRight size={16} aria-hidden="true" /></span>
          </Link>
        </div>
        <Screenshot
          src="/landing/painel-resultados.jpg"
          alt="Página de resultados do organizador com visualizações, cliques em ingressos e favoritos, e gráficos de visualizações recentes por evento"
          width={1800}
          height={1140}
          sizes="(max-width: 860px) 92vw, 720px"
          className={styles.bandShot}
        />
      </div>
    </section>
  );
}

export const FAQ_ITEMS = [
  {
    question: "Preciso pagar para usar o EventMap?",
    answer: "Não. Criar conta, explorar o mapa, salvar eventos e confirmar presença em eventos gratuitos não custa nada. Em eventos pagos, você paga o preço definido pelo organizador.",
  },
  {
    question: "Posso comprar ingressos pelo EventMap?",
    answer: "Sim, quando o organizador vende pelo EventMap. O pagamento é por Pix, processado pelo Mercado Pago, e o ingresso vira sua inscrição com QR Code de entrada. Alguns eventos vendem em outra bilheteria; nesse caso, a página do evento leva até ela.",
  },
  {
    question: "De onde vêm os eventos?",
    answer: "De organizadores com conta aprovada, cujos eventos passam por revisão antes de ficarem públicos, e de importações verificadas a partir de fontes oficiais. Um evento importado pode ser assumido pelo organizador real.",
  },
  {
    question: "A demonstração mostra eventos reais?",
    answer: "Não. A interface é a do EventMap, mas os eventos, pessoas e números da demonstração e das capturas de tela são fictícios.",
  },
] as const;

export function FaqSection() {
  return (
    <section id="perguntas" className={styles.section} aria-labelledby="faq-titulo">
      <div className={cn(styles.container, styles.faqGrid)}>
        <h2 id="faq-titulo" className={styles.h2}>Perguntas frequentes.</h2>
        <div className={styles.faqList}>
          {FAQ_ITEMS.map(item => (
            <details key={item.question} className={styles.faqItem}>
              <summary>
                <span>{item.question}</span>
                <Plus size={18} aria-hidden="true" className={styles.faqIcon} />
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className={cn(styles.section, styles.final)} aria-labelledby="cta-final-titulo">
      <div className={cn(styles.container, styles.finalInner)}>
        <h2 id="cta-final-titulo" className={styles.h2Large}>Sua cidade está acontecendo agora.</h2>
        <p className={styles.lead}>Abra o mapa e veja o que tem perto de você.</p>
        <div className={styles.actions}>
          <Link href="/" className={cn(styles.btn, styles.btnPrimary)}>
            Explorar eventos
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link href="/register" className={cn(styles.btn, styles.btnGhost)}>Criar conta grátis</Link>
        </div>
      </div>
    </section>
  );
}
