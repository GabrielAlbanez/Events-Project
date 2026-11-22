import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./Landing.module.css";

export const FAQ_ITEMS = [
  {
    question: "Preciso pagar para usar o EventMap?",
    answer: "Não. Criar conta, explorar o mapa, salvar eventos e confirmar presença em eventos gratuitos não custa nada. Em eventos pagos, você paga o preço definido pelo organizador.",
  },
  {
    question: "Posso comprar ingressos pelo EventMap?",
    answer: "Sim, quando o organizador vende pelo EventMap. O pagamento é por Pix, processado pelo Mercado Pago, e você pode aplicar um cupom de desconto quando houver. O ingresso vira sua inscrição com QR Code de entrada. Alguns eventos vendem em outra bilheteria; nesse caso, a página do evento leva até ela.",
  },
  {
    question: "O que acontece quando um evento lota ou exige aprovação?",
    answer: "Se o evento tem lotação e as vagas acabam, você entra na lista de espera e é avisado se abrir uma vaga. Em eventos com aprovação, você pede para participar e a organização aprova ou recusa; em eventos pagos, a compra só é liberada depois da aprovação.",
  },
  {
    question: "De onde vêm os eventos?",
    answer: "De organizadores com conta aprovada, cujos eventos passam por revisão antes de ficarem públicos, e de importações automáticas verificadas a partir de fontes oficiais. Um evento importado pode ser assumido pelo organizador real.",
  },
  {
    question: "Outras pessoas veem que eu vou a um evento?",
    answer: "As Conexões são opcionais: você só aparece para outros participantes se ativá-las. Comunidade e chat do evento servem para avisos, perguntas e conversa com quem também vai.",
  },
  {
    question: "As simulações desta página mostram eventos reais?",
    answer: "Não. A interface é inspirada no EventMap, mas os eventos, pessoas e números das simulações e das capturas de tela marcadas como demonstração são fictícios.",
  },
] as const;

export function FaqSection() {
  return (
    <section id="perguntas" className={styles.section} aria-labelledby="faq-titulo">
      <div className={cn(styles.container, styles.faqGrid)}>
        <h2 id="faq-titulo" className={cn(styles.h2, styles.reveal)}>Perguntas frequentes.</h2>
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
    <section className={styles.final} aria-labelledby="cta-final-titulo">
      <div className={cn(styles.container, styles.finalInner, styles.reveal)}>
        <h2 id="cta-final-titulo" className={styles.h2Large}>Sua cidade está acontecendo agora.</h2>
        <p className={styles.leadNight}>Abra o mapa e veja o que tem perto de você hoje.</p>
        <div className={styles.actions}>
          <Link href="/" className={cn(styles.btn, styles.btnPrimary)}>
            Explorar eventos
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link href="/register" className={cn(styles.btn, styles.btnNight)}>Criar conta grátis</Link>
        </div>
      </div>
    </section>
  );
}
