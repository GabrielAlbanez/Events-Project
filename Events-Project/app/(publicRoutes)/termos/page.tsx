import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { privacyConfig } from "@/lib/privacy";
import { Highlight } from "@/components/ui/highlight";

export const metadata: Metadata = { title: "Termos de Uso", description: "Regras de uso do EventMap para quem descobre eventos e para quem os organiza: conteúdo, moderação, responsabilidades e privacidade." };

/** Version label shown to users. Update it whenever the text changes in a relevant way. */
const termsVersion = { label: "Versão 0.2 — para validação jurídica", updatedAt: "23 de novembro de 2026" } as const;

const linkClass = "rounded-sm font-medium text-brand underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const sections = [
  { id: "aceite", title: "1. Aceite e quem pode usar" },
  { id: "servico", title: "2. O que o EventMap oferece" },
  { id: "conta", title: "3. Sua conta" },
  { id: "participantes", title: "4. Para quem participa de eventos" },
  { id: "organizadores", title: "5. Para organizadores" },
  { id: "ingressos", title: "6. Venda de ingressos pelo EventMap" },
  { id: "conteudo", title: "7. Política de conteúdo" },
  { id: "moderacao", title: "8. Moderação e medidas" },
  { id: "responsabilidade", title: "9. Limites de responsabilidade" },
  { id: "privacidade", title: "10. Privacidade e LGPD" },
  { id: "alteracoes", title: "11. Alterações, contato e foro" },
] as const;

export default function TermsPage() {
  return <div className="em-page w-full min-w-0" data-decor="ring">
    <div className="px-4 py-8 sm:px-6 lg:px-10">
    <article className="mx-auto max-w-3xl space-y-10 pb-12 [&_li]:leading-7 [&_p]:leading-7">
      <header className="space-y-4">
        <Link href="/" className={`inline-flex min-h-11 items-center ${linkClass}`}>← Voltar para explorar</Link>
        <p className="em-eyebrow">EventMap</p>
        <h1 className="em-title">Termos de <Highlight>Uso</Highlight></h1>
        <div role="note" className="rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <p className="font-semibold">{termsVersion.label}</p>
          <p>Este texto é uma minuta preparada pela equipe do produto e ainda não foi revisado por advogado. Ele descreve as regras de funcionamento atuais do EventMap e pode mudar após a validação jurídica.</p>
        </div>
        <p className="text-base text-muted-foreground">Estes termos explicam as regras para usar o EventMap, tanto para quem procura eventos quanto para quem os publica. Leia também a <Link href="/privacidade" className={linkClass}>Política de Privacidade</Link>, que faz parte destes termos.</p>
        <p className="text-sm text-muted-foreground">Atualizado em {termsVersion.updatedAt}.</p>
      </header>

      <nav aria-labelledby="terms-index" className="rounded-2xl bg-muted/40 p-5 sm:p-6">
        <h2 id="terms-index" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Nesta página</h2>
        <ol className="mt-3 grid gap-1 sm:grid-cols-2">{sections.map(section => <li key={section.id}><a href={`#${section.id}`} className={`inline-flex min-h-11 items-center text-sm ${linkClass} no-underline hover:underline`}>{section.title}</a></li>)}</ol>
      </nav>

      <Section id="aceite" title={sections[0].title}>
        <p>Ao criar uma conta ou usar recursos que exigem login, você declara que leu e concorda com estes termos e com a Política de Privacidade. Se não concordar, não utilize o serviço. Navegar pelos eventos públicos sem conta também está sujeito às regras de conteúdo e de uso adequado descritas aqui.</p>
        <p>O EventMap é destinado a pessoas com 18 anos ou mais, ou a adolescentes que usem o serviço com autorização e acompanhamento dos responsáveis legais. Eventos com classificação etária restrita seguem a indicação informada pelo organizador.</p>
      </Section>

      <Section id="servico" title={sections[1].title}>
        <p>O EventMap é uma plataforma para descobrir eventos em mapa e agenda, salvar favoritos, confirmar presença, participar de comunidades e conversas de eventos e, para contas autorizadas, publicar e gerenciar eventos.</p>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>Em eventos indicados na página como &quot;Comprar ingresso&quot;, o EventMap intermedeia a venda de ingressos por Pix, processados pelo Mercado Pago (veja a seção 6). Nos demais eventos, o EventMap não vende ingressos: links de compra levam a serviços de terceiros, com termos próprios.</li>
          <li>A confirmação de presença no EventMap é um registro de interesse e de lotação definido pelo organizador; ela não substitui ingresso emitido por outra bilheteria, salvo quando o organizador informar o contrário.</li>
          <li>Alguns eventos são cadastrados pela própria equipe do EventMap a partir de fontes públicas oficiais. O organizador real pode pedir a administração desses eventos pela página do evento.</li>
          <li>Recursos podem ser alterados, suspensos ou descontinuados para manutenção, segurança ou evolução do produto.</li>
        </ul>
      </Section>

      <Section id="conta" title={sections[2].title}>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>Informe dados verdadeiros e mantenha seu e-mail atualizado. Você é responsável pelas atividades feitas com sua conta.</li>
          <li>Guarde sua senha com segurança e avise o EventMap se perceber uso indevido. Não compartilhe a conta nem crie contas para se passar por outra pessoa ou marca.</li>
          <li>Você pode pedir a exclusão da conta e dos dados pelo <Link href="/privacidade/solicitacoes" className={linkClass}>canal de privacidade</Link>.</li>
        </ul>
      </Section>

      <Section id="participantes" title={sections[3].title}>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>Ao confirmar presença, seu nome e e-mail ficam visíveis para o organizador do evento, para a equipe autorizada por ele e para a administração do EventMap, para controle de lotação, lista de espera e check-in.</li>
          <li>O QR de check-in é pessoal. Não o compartilhe nem tente reutilizá-lo; ele pode ser renovado ou invalidado.</li>
          <li>Datas, horários, preços, local e regras de entrada são definidos pelo organizador. Confira as informações com ele e com a bilheteria antes de se deslocar ou comprar.</li>
          <li>Nas comunidades, conversas e conexões, trate as outras pessoas com respeito. Nas conexões da festa, use as ferramentas de bloqueio e denúncia quando necessário.</li>
        </ul>
      </Section>

      <Section id="organizadores" title={sections[4].title}>
        <p>Contas de organizador (perfil Promotor) são liberadas pela administração do EventMap após análise. A liberação pode ser negada ou revogada se as regras forem descumpridas.</p>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>Você é responsável pela veracidade e pela legalidade do evento publicado: dados, imagens, textos, classificação etária, acessibilidade, preços e link de compra.</li>
          <li>Publique apenas eventos que você organiza ou está autorizado a divulgar, com imagens e marcas sobre as quais tenha direitos.</li>
          <li>Eventos novos e algumas alterações passam por revisão antes de ficarem públicos. A aprovação não significa que o EventMap verificou ou garante o evento.</li>
          <li>Mantenha o evento atualizado. Em caso de adiamento ou cancelamento, atualize a página para que os participantes sejam avisados.</li>
          <li>Use os dados dos participantes (nome, e-mail, presença) apenas para a gestão daquele evento, em conformidade com a LGPD. Não os venda, não os use para envio de publicidade sem base legal e não os compartilhe com terceiros sem autorização.</li>
          <li>Pessoas que você adiciona à equipe do evento agem em seu nome; você responde pelo uso que fizerem das ferramentas.</li>
          <li>Hoje o uso por organizadores é gratuito, em fase piloto, exceto a taxa sobre ingressos vendidos pelo EventMap (seção 6) e serviços opcionais contratados à parte, como destaques. Planos pagos, se criados, terão condições próprias de preço, cobrança, cancelamento e reembolso informadas antes da contratação.</li>
        </ul>
      </Section>

      <Section id="ingressos" title={sections[5].title}>
        <p>Quando o organizador ativa a venda pelo EventMap, a compra é feita por Pix gerado no site e processado pelo Mercado Pago. O EventMap atua como intermediador: o valor é pago diretamente na conta do Mercado Pago do organizador, que é o vendedor do ingresso e o responsável pelo evento.</p>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li><strong className="text-foreground">Taxa da plataforma:</strong> o EventMap retém 10% do valor de cada ingresso vendido, descontados do valor do organizador. Quem compra paga o preço anunciado, sem acréscimo. O Mercado Pago pode cobrar do organizador a própria tarifa sobre o Pix.</li>
          <li><strong className="text-foreground">Confirmação:</strong> o ingresso é confirmado depois que o Mercado Pago aprova o pagamento e vira a inscrição com QR Code usada no check-in. O Pix vale por 30 minutos; depois disso, o pedido expira e a vaga é liberada.</li>
          <li><strong className="text-foreground">Um ingresso por pessoa:</strong> nesta fase, cada conta compra um ingresso por evento, pessoal e intransferível.</li>
          <li><strong className="text-foreground">Cancelamento e reembolso:</strong> o reembolso é feito pelo organizador, pelo painel de pagamentos, com estorno integral pelo Mercado Pago (incluindo a taxa da plataforma). Em compras pela internet, quem compra pode desistir em até 7 dias a partir da compra (direito de arrependimento, art. 49 do Código de Defesa do Consumidor); peça o estorno ao organizador por esse prazo. Se o evento for cancelado, o organizador deve estornar os ingressos antes do cancelamento.</li>
          <li>O EventMap não guarda dados de pagamento de quem compra. As credenciais da conta do Mercado Pago do organizador ficam criptografadas e podem ser desconectadas a qualquer momento.</li>
        </ul>
      </Section>

      <Section id="conteudo" title={sections[6].title}>
        <p>É proibido publicar ou enviar, em eventos, comunidades, conversas, perfis ou imagens, conteúdo que:</p>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>seja ilegal, fraudulento ou engane sobre o evento, o preço ou o organizador (incluindo eventos falsos e golpes com ingressos);</li>
          <li>promova ódio, discriminação, assédio, ameaça ou violência, ou exponha dados pessoais de terceiros sem autorização;</li>
          <li>tenha nudez, conteúdo sexual explícito ou qualquer conteúdo que envolva sexualização de menores;</li>
          <li>viole direitos autorais, de imagem ou de marca;</li>
          <li>seja spam, propaganda não relacionada ao evento, malware ou tentativa de obter senhas e dados;</li>
          <li>incentive venda de produtos proibidos ou atividades perigosas.</li>
        </ul>
        <p className="text-muted-foreground">Também é proibido tentar burlar limites técnicos, automatizar acessos sem autorização, explorar falhas de segurança ou interferir no funcionamento do serviço.</p>
      </Section>

      <Section id="moderacao" title={sections[7].title}>
        <p className="text-muted-foreground">Pessoas com conta podem denunciar eventos e, nas conexões da festa, perfis. A administração analisa as denúncias e pode, de forma proporcional à gravidade: pedir ajustes, ocultar ou remover conteúdo, cancelar a publicação de um evento, suspender recursos ou suspender e excluir contas. Em casos graves ou de risco a terceiros, medidas podem ser aplicadas antes de contato prévio. Quando possível, informaremos o motivo da medida. Se discordar, responda pela central de notificações ou pelo contato abaixo.</p>
      </Section>

      <Section id="responsabilidade" title={sections[8].title}>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>O EventMap divulga eventos de terceiros e não é organizador, produtor nem vendedor desses eventos. Realização, segurança, qualidade, mudanças, cancelamentos e reembolsos são responsabilidade do organizador e da bilheteria utilizada, inclusive quando o ingresso é vendido pelo EventMap.</li>
          <li>O serviço é oferecido como está, sem garantia de funcionamento ininterrupto. Mapas, rotas, notificações e logins de terceiros dependem desses fornecedores.</li>
          <li>Na medida permitida pela lei, o EventMap não responde por prejuízos indiretos decorrentes de informações publicadas por organizadores ou usuários, nem por serviços externos acessados por links.</li>
          <li>Nada nestes termos afasta direitos garantidos pelo Código de Defesa do Consumidor ou por outra norma que não possa ser afastada por contrato.</li>
        </ul>
      </Section>

      <Section id="privacidade" title={sections[9].title}>
        <p className="text-muted-foreground">O tratamento de dados pessoais segue a Lei Geral de Proteção de Dados (Lei nº 13.709/2018) e está descrito na <Link href="/privacidade" className={linkClass}>Política de Privacidade</Link>, incluindo quais dados usamos, por quê, com quem compartilhamos e como exercer seus direitos. Organizadores que recebem dados de participantes também devem cumprir a LGPD no uso desses dados.</p>
      </Section>

      <Section id="alteracoes" title={sections[10].title}>
        <p className="text-muted-foreground">Podemos atualizar estes termos. Mudanças relevantes serão publicadas nesta página com nova data e, quando adequado, avisadas no aplicativo. Continuar usando o serviço após o aviso significa concordar com a nova versão.</p>
        <p className="text-muted-foreground">Responsável: <strong className="text-foreground">{privacyConfig.controllerName}</strong>.{privacyConfig.contactEmail ? <> Contato: <a className={`${linkClass} break-all`} href={`mailto:${privacyConfig.contactEmail}`}>{privacyConfig.contactEmail}</a>.</> : " O contato ainda não foi publicado."}</p>
        <p className="text-muted-foreground">Estes termos seguem a legislação brasileira. O foro competente será definido na validação jurídica, respeitado o direito do consumidor de ajuizar ações no seu domicílio.</p>
      </Section>
    </article>
    </div>
  </div>;
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 space-y-4">
    <h2 id={`${id}-title`} className="text-xl font-semibold">{title}</h2>
    {children}
  </section>;
}
