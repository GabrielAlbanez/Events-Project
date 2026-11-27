import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth";
import type { LucideIcon } from "lucide-react";
import { ArrowUpToLine, BadgeCheck, BarChart3, BellRing, ChevronDown, ListChecks, MapPin, MapPinned, MessagesSquare, QrCode, Repeat, ShieldCheck, Sparkles, UserPlus } from "lucide-react";
import { FeaturedBadge } from "@/components/MyComponents/FeaturedBadge";
import { OrganizerRequestPanel } from "@/components/MyComponents/organizer/OrganizerRequestPanel";
import { authOptions } from "@/lib/auth/options";
import { authPathWithReturn } from "@/lib/authReturn";
import { MAX_FEATURED_ON_TOP, PROMOTION_PACKAGES, formatPromotionAmount } from "@/lib/promotions";
import { Highlight } from "@/components/ui/highlight";

export const metadata: Metadata = {
  title: "Para organizadores",
  description: "Publique eventos no mapa do EventMap, receba inscrições com lotação e lista de espera, faça check-in por QR com sua equipe e acompanhe os resultados.",
};

type Feature = { icon: LucideIcon; title: string; text: string };

/** Only features that exist in the product today. Update this list when a feature ships or is removed. */
const features: Feature[] = [
  { icon: MapPinned, title: "Descoberta no mapa e na agenda", text: "Seu evento aparece no mapa, na busca por região e categoria e na agenda de quem procura o que fazer por perto." },
  { icon: ListChecks, title: "Inscrições com lotação e lista de espera", text: "Defina a capacidade. Quando lota, novas pessoas entram na lista de espera e são promovidas quando surge uma vaga." },
  { icon: QrCode, title: "Check-in por QR com sua equipe", text: "Cada participante tem um QR pessoal. Você e as pessoas da equipe do evento fazem o check-in na entrada pelo celular." },
  { icon: BarChart3, title: "Resultados e funil", text: "Acompanhe visualizações, inscrições, lista de espera e comparecimento por evento na página de resultados." },
  { icon: MessagesSquare, title: "Comunidade e conversa do evento", text: "Avisos, perguntas, enquetes, programação e chat reúnem o público antes, durante e depois do evento." },
  { icon: BellRing, title: "Notificações para o público", text: "Mudanças de data, local ou cancelamento avisam automaticamente quem se inscreveu ou salvou o evento. Quem segue você é avisado quando um novo evento seu é publicado." },
  { icon: Repeat, title: "Edições recorrentes", text: "Crie séries semanais ou mensais e duplique um evento para a próxima edição sem cadastrar tudo de novo." },
  { icon: ShieldCheck, title: "Revisão e eventos verificados", text: "Eventos passam por revisão antes de ficarem públicos. Eventos importados de fontes oficiais podem ser reivindicados pelo organizador real." },
];

const steps = [
  { title: "Crie sua conta", text: "O cadastro é gratuito e leva menos de um minuto." },
  { title: "Peça acesso de organizador", text: "Conte quem você é e que eventos organiza. A equipe do EventMap analisa o pedido e avisa pela central de notificações." },
  { title: "Publique e acompanhe", text: "Cadastre o evento, envie para revisão e acompanhe inscrições, check-ins e resultados em um só lugar." },
] as const;

/** Highlight benefits as implemented: list ordering (lib/promotions.ts), badge and larger map pin. */
const highlightBenefits: Feature[] = [
  { icon: ArrowUpToLine, title: "No topo da agenda e da página inicial", text: `O evento sobe para o topo da agenda e de "Mais eventos para descobrir". Até ${MAX_FEATURED_ON_TOP} destaques ficam no topo ao mesmo tempo, por data.` },
  { icon: Sparkles, title: "Selo \"Destaque\"", text: "O cartão do evento mostra o selo, identificado para o público como destaque patrocinado." },
  { icon: MapPin, title: "Pin maior no mapa", text: "O evento ganha um pin maior no mapa, mais fácil de notar entre os eventos da região." },
];

const highlightSteps = [
  { title: "Publique o evento", text: "O destaque vale para eventos publicados e ainda não encerrados." },
  { title: "Clique em \"Destacar evento\"", text: "Em Meus eventos, escolha o evento, o pacote e gere o pedido." },
  { title: "Pague o Pix e avise", text: "Use \"Já paguei\" no pedido. Ativamos o destaque depois de conferir o pagamento." },
] as const;

const faq = [
  { q: "Quanto custa?", a: "Hoje o uso por organizadores é gratuito, em um piloto com organizadores selecionados. Os itens pagos são o destaque opcional de eventos, com preços informados nesta página antes de qualquer pedido, e, se você vender ingressos pelo EventMap, a taxa de 20% por ingresso vendido. Planos pagos ainda estão em definição e, se forem criados, terão preço e condições informados antes de qualquer cobrança." },
  { q: "O EventMap vende ingressos?", a: "Sim, de forma opcional, por Pix: você conecta sua conta do Mercado Pago, o dinheiro cai direto nela e o EventMap retém uma taxa de 10% por ingresso vendido (o Mercado Pago também desconta a tarifa do Pix). Se preferir, informe o link da sua bilheteria; a inscrição gratuita no EventMap continua funcionando como confirmação de presença com controle de lotação e check-in." },
  { q: "Quanto tempo leva a análise do pedido?", a: "A equipe analisa os pedidos manualmente. Quando sua conta for liberada, você recebe um aviso na central de notificações e já pode criar eventos." },
  { q: "Meu evento já está no EventMap. Como assumo a administração?", a: "Alguns eventos são cadastrados pela equipe a partir de fontes oficiais. Na página do evento, use \"Sou o organizador deste evento\". Depois de confirmar sua identidade, a equipe transfere o evento para sua conta." },
  { q: "Quem pode ver os dados dos participantes?", a: "Nome e e-mail de quem se inscreve ficam visíveis para você, para a equipe que você adicionar ao evento e para a administração do EventMap, apenas para gestão daquele evento, conforme os Termos de Uso e a LGPD." },
  { q: "Posso ter pessoas da equipe ajudando no check-in?", a: "Sim. Pessoas adicionadas à equipe do evento podem fazer o check-in dos participantes sem acesso às demais configurações." },
] as const;

const linkClass = "rounded-sm font-medium text-brand underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const primaryCta = "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-cta px-5 font-semibold text-cta-foreground shadow-sm transition-colors hover:bg-cta/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none";
const secondaryCta = "inline-flex min-h-12 items-center justify-center rounded-full border border-input bg-background px-5 font-semibold text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none";

export default async function ForOrganizersPage() {
  const session = await getServerSession(authOptions).catch(() => null);
  const signedIn = Boolean(session?.user?.id);
  return <div className="w-full min-w-0">
    <div className="mx-auto max-w-6xl space-y-20 px-4 py-10 sm:px-6 sm:py-14 lg:px-10">
      <section aria-labelledby="org-hero" className="relative overflow-hidden rounded-[26px] border border-border bg-card px-5 py-10 sm:px-10 sm:py-14 shadow-[var(--em-shadow-card)]">
        <div aria-hidden="true" className="pointer-events-none absolute -right-28 -top-32 h-80 w-80 rounded-full border-[70px] border-cta opacity-50 dark:opacity-25" />
        <div className="relative max-w-2xl">
          <p className="em-eyebrow"><Sparkles className="h-4 w-4" aria-hidden="true" /> Para organizadores</p>
          <h1 id="org-hero" className="em-title mt-4 text-[clamp(34px,4.6vw,56px)]">Seu evento no <Highlight>mapa</Highlight> de quem procura o que fazer</h1>
          <p className="mt-5 text-base leading-7 text-muted-foreground sm:text-lg">Publique eventos, receba inscrições com lotação e lista de espera, faça check-in por QR com sua equipe e veja quem realmente compareceu.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href="#pedir-acesso" className={primaryCta}><UserPlus className="h-4 w-4" aria-hidden="true" /> Pedir acesso de organizador</a>
            <a href="#como-funciona" className={secondaryCta}>Ver como funciona</a>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Gratuito no piloto e sem taxa por inscrição. Venda de ingressos por Pix é opcional, com taxa de 20% por ingresso vendido.</p>
        </div>
      </section>

      <section aria-labelledby="org-features" className="space-y-8">
        <div className="max-w-2xl">
          <h2 id="org-features" className="text-2xl font-bold tracking-tight sm:text-3xl">Tudo o que você usa hoje, do anúncio à portaria</h2>
          <p className="mt-3 leading-7 text-muted-foreground">Recursos disponíveis agora para contas de organizador.</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, text }) => <li key={title} className="rounded-[22px] border border-border bg-card p-5 shadow-[var(--em-shadow-card)]">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand"><Icon className="h-5 w-5" aria-hidden="true" /></span>
            <h3 className="mt-4 font-semibold">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
          </li>)}
        </ul>
      </section>

      <section id="como-funciona" aria-labelledby="org-steps" className="scroll-mt-24 space-y-8">
        <h2 id="org-steps" className="text-2xl font-bold tracking-tight sm:text-3xl">Como funciona</h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => <li key={step.title} className="rounded-2xl bg-muted/40 p-5 sm:p-6">
            <span aria-hidden="true" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background">{index + 1}</span>
            <h3 className="mt-4 font-semibold"><span className="sr-only">Passo {index + 1}: </span>{step.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.text}</p>
          </li>)}
        </ol>
      </section>

      <section id="planos" aria-labelledby="org-plans" className="scroll-mt-24 space-y-8">
        <div className="max-w-2xl">
          <h2 id="org-plans" className="text-2xl font-bold tracking-tight sm:text-3xl">Planos</h2>
          <p className="mt-3 leading-7 text-muted-foreground">Ainda não há cobrança pelos planos nem preços definidos. Estamos construindo os planos com os primeiros organizadores. O <a href="#destaque" className={linkClass}>destaque de eventos</a> é opcional e cobrado à parte.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <article aria-labelledby="plan-pilot" className="flex flex-col rounded-2xl border-2 border-brand/40 bg-card p-6 shadow-surface">
            <p className="text-sm font-semibold text-brand">Disponível agora</p>
            <h3 id="plan-pilot" className="mt-2 text-xl font-semibold">Piloto gratuito para organizadores selecionados</h3>
            <ul className="mt-4 space-y-2 text-sm leading-6 text-muted-foreground">
              {["Publicação de eventos com revisão", "Inscrições, lotação e lista de espera", "Check-in por QR com equipe", "Resultados, comunidade e notificações"].map(item => <li key={item} className="flex gap-2"><BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />{item}</li>)}
            </ul>
            <a href="#pedir-acesso" className={`${primaryCta} mt-6 self-start`}>Pedir acesso</a>
          </article>
          <article aria-labelledby="plan-pro" className="flex flex-col rounded-[22px] border border-border bg-card p-6 shadow-[var(--em-shadow-card)]">
            <p className="text-sm font-semibold text-muted-foreground">Em definição</p>
            <h3 id="plan-pro" className="mt-2 text-xl font-semibold">Pro e Enterprise</h3>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">Para quem faz eventos com frequência, produtoras com vários eventos e instituições com agenda oficial. Entre na lista para ajudar a definir o que entra em cada plano e ser avisado quando estiverem disponíveis.</p>
            <details className="group mt-6 rounded-xl border border-border">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                Entrar na lista de interesse
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
              </summary>
              <div className="border-t border-border p-4"><OrganizerRequestPanel interest="plans" returnTo="/para-organizadores#planos" /></div>
            </details>
          </article>
        </div>
      </section>

      <section id="destaque" aria-labelledby="org-highlight" className="scroll-mt-24 space-y-8 rounded-[26px] border border-border bg-card p-5 sm:p-10 shadow-[var(--em-shadow-card)]">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
          <div>
            <FeaturedBadge />
            <h2 id="org-highlight" className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Destaque seu evento</h2>
            <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">Um impulso opcional e pago para o evento ser visto primeiro por quem procura o que fazer.</p>
            <ul className="mt-6 space-y-5">
              {highlightBenefits.map(({ icon: Icon, title, text }) => <li key={title} className="flex gap-4">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p></div>
              </li>)}
            </ul>
          </div>
          <div>
            <h3 className="sr-only">Pacotes de destaque</h3>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {PROMOTION_PACKAGES.map(item => <li key={item.id} className="rounded-[22px] border border-border bg-background p-5">
                <p className="font-semibold">{item.label} de destaque</p>
                <p className="mt-1 text-3xl font-bold tracking-tight">{formatPromotionAmount(item.amountCents)}</p>
                <p className="mt-1 text-sm text-muted-foreground">Pagamento único via Pix</p>
              </li>)}
            </ul>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">Pagamento via Pix, confirmado pela equipe. O destaque começa quando o pagamento é confirmado.</p>
          </div>
        </div>
        <div>
          <h3 className="text-lg font-semibold">Como destacar</h3>
          <ol className="mt-4 grid gap-4 md:grid-cols-3">
            {highlightSteps.map((step, index) => <li key={step.title} className="rounded-2xl bg-muted/40 p-5">
              <span aria-hidden="true" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background">{index + 1}</span>
              <h4 className="mt-4 font-semibold"><span className="sr-only">Passo {index + 1}: </span>{step.title}</h4>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.text}</p>
            </li>)}
          </ol>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {signedIn
            ? <Link href="/myEvents" className={primaryCta}><Sparkles className="h-4 w-4" aria-hidden="true" /> Ir para Meus eventos</Link>
            : <>
              <Link href={authPathWithReturn("/register", "/para-organizadores#pedir-acesso")} className={primaryCta}><UserPlus className="h-4 w-4" aria-hidden="true" /> Criar conta de organizador</Link>
              <Link href={authPathWithReturn("/login", "/myEvents")} className={secondaryCta}>Já tenho conta</Link>
            </>}
          <p className="text-sm leading-6 text-muted-foreground sm:ml-2">Disponível para contas de organizador com evento publicado.</p>
        </div>
      </section>

      <section id="pedir-acesso" aria-labelledby="org-request" className="scroll-mt-24 grid gap-8 rounded-[26px] border border-border bg-card p-5 sm:p-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] shadow-[var(--em-shadow-card)]">
        <div>
          <h2 id="org-request" className="text-2xl font-bold tracking-tight sm:text-3xl">Pedir acesso de organizador</h2>
          <p className="mt-3 leading-7 text-muted-foreground">Conte um pouco sobre você e seus eventos. A equipe do EventMap analisa cada pedido e responde pela central de notificações.</p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Ao enviar, você concorda com os <Link href="/termos" className={linkClass}>Termos de Uso</Link> para organizadores.</p>
        </div>
        <OrganizerRequestPanel interest="access" returnTo="/para-organizadores#pedir-acesso" />
      </section>

      <section aria-labelledby="org-faq" className="mx-auto max-w-3xl space-y-6">
        <h2 id="org-faq" className="text-2xl font-bold tracking-tight sm:text-3xl">Perguntas frequentes</h2>
        <div className="divide-y divide-border rounded-[22px] border border-border bg-card shadow-[var(--em-shadow-card)]">
          {faq.map(item => <details key={item.q} className="group">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              {item.q}
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
            </summary>
            <p className="px-5 pb-5 text-sm leading-6 text-muted-foreground">{item.a}</p>
          </details>)}
        </div>
      </section>
    </div>
  </div>;
}
