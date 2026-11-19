import type { Metadata } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { BadgeCheck, BarChart3, BellRing, ChevronDown, ListChecks, MapPinned, MessagesSquare, QrCode, Repeat, ShieldCheck, Sparkles, UserPlus } from "lucide-react";
import { OrganizerRequestPanel } from "@/components/MyComponents/organizer/OrganizerRequestPanel";

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

const faq = [
  { q: "Quanto custa?", a: "Hoje o uso por organizadores é gratuito, em um piloto com organizadores selecionados. Planos pagos ainda estão em definição e, se forem criados, terão preço e condições informados antes de qualquer cobrança." },
  { q: "O EventMap vende ingressos?", a: "Não. O EventMap não processa pagamentos. Você pode informar o link da sua bilheteria, e a inscrição no EventMap funciona como confirmação de presença com controle de lotação e check-in." },
  { q: "Quanto tempo leva a análise do pedido?", a: "A equipe analisa os pedidos manualmente. Quando sua conta for liberada, você recebe um aviso na central de notificações e já pode criar eventos." },
  { q: "Meu evento já está no EventMap. Como assumo a administração?", a: "Alguns eventos são cadastrados pela equipe a partir de fontes oficiais. Na página do evento, use \"Sou o organizador deste evento\". Depois de confirmar sua identidade, a equipe transfere o evento para sua conta." },
  { q: "Quem pode ver os dados dos participantes?", a: "Nome e e-mail de quem se inscreve ficam visíveis para você, para a equipe que você adicionar ao evento e para a administração do EventMap, apenas para gestão daquele evento, conforme os Termos de Uso e a LGPD." },
  { q: "Posso ter pessoas da equipe ajudando no check-in?", a: "Sim. Pessoas adicionadas à equipe do evento podem fazer o check-in dos participantes sem acesso às demais configurações." },
] as const;

const linkClass = "rounded-sm font-medium text-brand underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const primaryCta = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-cta px-5 font-semibold text-cta-foreground shadow-sm transition-colors hover:bg-cta/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none";
const secondaryCta = "inline-flex min-h-12 items-center justify-center rounded-xl border border-input bg-background px-5 font-semibold text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none";

export default function ForOrganizersPage() {
  return <div className="w-full min-w-0">
    <div className="mx-auto max-w-6xl space-y-20 px-4 py-10 sm:px-6 sm:py-14 lg:px-10">
      <section aria-labelledby="org-hero" className="relative overflow-hidden rounded-3xl border border-border bg-card px-5 py-10 shadow-surface sm:px-10 sm:py-14">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/10 blur-3xl" />
        <div className="relative max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-sm font-semibold text-brand"><Sparkles className="h-4 w-4" aria-hidden="true" /> Para organizadores</p>
          <h1 id="org-hero" className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-5xl">Seu evento no mapa de quem procura o que fazer</h1>
          <p className="mt-5 text-base leading-7 text-muted-foreground sm:text-lg">Publique eventos, receba inscrições com lotação e lista de espera, faça check-in por QR com sua equipe e veja quem realmente compareceu.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href="#pedir-acesso" className={primaryCta}><UserPlus className="h-4 w-4" aria-hidden="true" /> Pedir acesso de organizador</a>
            <a href="#como-funciona" className={secondaryCta}>Ver como funciona</a>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Gratuito no piloto. O EventMap não vende ingressos nem cobra taxa por inscrição.</p>
        </div>
      </section>

      <section aria-labelledby="org-features" className="space-y-8">
        <div className="max-w-2xl">
          <h2 id="org-features" className="text-2xl font-bold tracking-tight sm:text-3xl">Tudo o que você usa hoje, do anúncio à portaria</h2>
          <p className="mt-3 leading-7 text-muted-foreground">Recursos disponíveis agora para contas de organizador.</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, text }) => <li key={title} className="rounded-2xl border border-border bg-card p-5 shadow-surface">
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
          <p className="mt-3 leading-7 text-muted-foreground">Ainda não há cobrança nem preços definidos. Estamos construindo os planos com os primeiros organizadores.</p>
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
          <article aria-labelledby="plan-pro" className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-surface">
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

      <section id="pedir-acesso" aria-labelledby="org-request" className="scroll-mt-24 grid gap-8 rounded-3xl border border-border bg-card p-5 shadow-surface sm:p-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div>
          <h2 id="org-request" className="text-2xl font-bold tracking-tight sm:text-3xl">Pedir acesso de organizador</h2>
          <p className="mt-3 leading-7 text-muted-foreground">Conte um pouco sobre você e seus eventos. A equipe do EventMap analisa cada pedido e responde pela central de notificações.</p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Ao enviar, você concorda com os <Link href="/termos" className={linkClass}>Termos de Uso</Link> para organizadores.</p>
        </div>
        <OrganizerRequestPanel interest="access" returnTo="/para-organizadores#pedir-acesso" />
      </section>

      <section aria-labelledby="org-faq" className="mx-auto max-w-3xl space-y-6">
        <h2 id="org-faq" className="text-2xl font-bold tracking-tight sm:text-3xl">Perguntas frequentes</h2>
        <div className="divide-y divide-border rounded-2xl border border-border bg-card">
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
