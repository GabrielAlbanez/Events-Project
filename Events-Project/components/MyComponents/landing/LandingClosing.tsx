import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { FadeInView } from "@/components/animations/FadeInView";
import { BrandLogo } from "@/components/MyComponents/BrandLogo";
import { cn } from "@/lib/utils";
import { CityMap } from "./CityMap";
import styles from "./Landing.module.css";

export const FAQ_ITEMS = [
  {
    question: "Preciso trocar minha bilheteria?",
    answer: "Não. O EventMap não vende ingressos: a página do evento leva ao link de compra que você já usa. Inscrição gratuita com capacidade, lista de espera, comunidade e check-in por QR funcionam aqui dentro, ao lado da sua bilheteria.",
  },
  {
    question: "Quanto custa?",
    answer: "Para participantes, é gratuito. Para organizadores, os valores dos planos ainda estão em definição e serão publicados nesta página. Hoje, quem entra como organizador fundador usa os recursos disponíveis e ajuda a desenhar os planos.",
  },
  {
    question: "Como viro organizador?",
    answer: "Crie sua conta gratuita. A equipe do EventMap analisa o cadastro e libera o perfil de organizador — ainda não é instantâneo. Depois disso, você publica eventos (que passam por validação) e acessa o painel de resultados.",
  },
  {
    question: "Funciona no celular?",
    answer: "Sim. O site é pensado para o celular e aceita notificações push no navegador, e existe um app mobile que usa a mesma conta e os mesmos dados.",
  },
  {
    question: "E os meus dados e os do público?",
    answer: "As conexões da festa só aparecem para quem ativa o perfil, e qualquer pessoa pode bloquear ou denunciar. Eventos e denúncias passam por moderação. O QR de check-in é assinado, e o painel do organizador mostra números agregados de interesse — visualizações, cliques no ingresso e favoritos.",
  },
  {
    question: "A demonstração usa dados reais?",
    answer: "Não. A demonstração interativa desta página é uma simulação com eventos e pessoas fictícios, que não acessa a plataforma. As capturas de tela mostram a interface real, também preenchida com dados de demonstração.",
  },
];

export function FaqSection() {
  return (
    <section id="faq" className={styles.section} aria-labelledby="faq-titulo">
      <div className={cn(styles.container, styles.faqGrid)}>
        <FadeInView>
          <p className={styles.eyebrow}>Perguntas frequentes</p>
          <h2 id="faq-titulo" className={styles.h2}>Respostas diretas.</h2>
          <p className={styles.lead}>Se ficou alguma dúvida, a demonstração guiada mostra o produto por dentro, sem criar conta.</p>
          <Link href="/demonstracao" className={styles.textLink} style={{ marginTop: 12, paddingInline: 0 }}>
            Abrir demonstração guiada <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </FadeInView>
        <div className={styles.faqList}>
          {FAQ_ITEMS.map(item => (
            <details key={item.question} className={styles.faqItem}>
              <summary>
                <span>{item.question}</span>
                <Plus size={20} aria-hidden="true" />
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
    <section className={cn(styles.section, styles.ink, styles.finalCta)} aria-labelledby="cta-titulo">
      <CityMap id="cta" />
      <FadeInView className={styles.container}>
        <p className={styles.eyebrow} style={{ justifyContent: "center" }}>Organizadores fundadores</p>
        <h2 id="cta-titulo" className={styles.h2}>Seu próximo evento merece mais do que um link de ingresso.</h2>
        <p className={styles.lead}>Leve as pessoas até a porta e mantenha todo mundo conectado quando chegar. Comece agora e ajude a construir o EventMap.</p>
        <div className={styles.actions}>
          <Link href="/register" className={cn(styles.btn, styles.btnPrimary)}>
            Quero ser organizador fundador <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link href="/" className={cn(styles.btn, styles.btnGhost)}>Explorar eventos</Link>
        </div>
        <p style={{ marginTop: 20 }}>
          <Link href="/demonstracao" className={styles.textLink}>Prefere uma demonstração guiada? <ArrowRight size={16} aria-hidden="true" /></Link>
        </p>
      </FadeInView>
    </section>
  );
}

const FOOTER_LINKS = [
  { label: "Explorar eventos", href: "/" },
  { label: "Agenda", href: "/EventsCreated" },
  { label: "Demonstração guiada", href: "/demonstracao" },
  { label: "Entrar", href: "/login" },
  { label: "Criar conta", href: "/register" },
];

export function LandingFooter() {
  return (
    <footer className={styles.footer}>
      <div className={cn(styles.container, styles.footerInner)}>
        <div className={styles.footerBrand}>
          <span className="dark"><BrandLogo /></span>
          <small>A cidade ao vivo</small>
        </div>
        <nav aria-label="Links do rodapé">
          <ul className={styles.footerNav}>
            {FOOTER_LINKS.map(link => <li key={link.href}><Link href={link.href}>{link.label}</Link></li>)}
          </ul>
        </nav>
        <p className={styles.copy}>© {new Date().getFullYear()} EventMap. Demonstrações e capturas usam dados fictícios.</p>
      </div>
    </footer>
  );
}
