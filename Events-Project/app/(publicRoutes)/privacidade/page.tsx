import type { Metadata } from "next";
import Link from "next/link";
import { privacyConfig, privacyReady } from "@/lib/privacy";
import { GoogleMapsPreference } from "@/components/MyComponents/GoogleMapsPreference";
import { MetricPreference } from "@/components/MyComponents/MetricPreference";

export const metadata: Metadata = { title: "Política de privacidade", description: "Saiba como o EventMap utiliza dados, cookies, localização e serviços de terceiros e como exercer seus direitos." };

const linkClass = "rounded-sm font-medium text-brand underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function PrivacyPage() {
  return <div className="w-full min-w-0 px-4 py-8 sm:px-6 lg:px-10">
    <article className="mx-auto max-w-3xl space-y-10 pb-12 [&_p]:leading-7 [&_li]:leading-7">
      <header className="space-y-4">
        <Link href="/" className={`inline-flex min-h-11 items-center ${linkClass}`}>← Voltar para explorar</Link>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Política de privacidade</h1>
        <p className="text-base text-muted-foreground">O EventMap é um projeto de portfólio. Este aviso explica os dados utilizados para descobrir eventos, manter sua conta e participar das comunidades. Use apenas os dados necessários e evite informações sensíveis nas demonstrações.</p>
        <p className="text-sm text-muted-foreground">Atualizado em {privacyConfig.updatedAt}.</p>
        <Link href="/privacidade/solicitacoes" className="inline-flex min-h-12 items-center rounded-xl bg-cta px-5 font-semibold text-cta-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">Solicitar acesso, correção ou exclusão</Link>
      </header>

      <section aria-labelledby="privacy-controller" className="space-y-4 rounded-2xl bg-muted/40 p-5 sm:p-7">
        <h2 id="privacy-controller" className="text-xl font-semibold">Quem responde pelos dados</h2>
        <p>Responsável pelo EventMap: <strong>{privacyConfig.controllerName || "identificação ainda não informada"}</strong>.</p>
        {privacyConfig.contactEmail ? <p>Contato de privacidade: <a className={`${linkClass} break-all`} href={`mailto:${privacyConfig.contactEmail}`}>{privacyConfig.contactEmail}</a>.</p> : <p>O contato de privacidade ainda não foi informado. O canal de atendimento não está disponível enquanto esse dado não for publicado.</p>}
        {!privacyReady && <p role="status" className="font-medium">Este aviso ainda depende da identificação e do contato do responsável para estar completo.</p>}
      </section>

      <section aria-labelledby="privacy-data" className="space-y-4">
        <h2 id="privacy-data" className="text-xl font-semibold">Dados e finalidades</h2>
        <ul className="list-disc space-y-3 pl-5 text-muted-foreground">
          <li><strong className="text-foreground">Conta e acesso:</strong> nome, e-mail, senha protegida por hash, verificações e dados de sessão permitem criar e proteger sua conta. Ao escolher entrar pelo Google, recebemos os dados de perfil autorizados, como nome, e-mail e imagem.</li>
          <li><strong className="text-foreground">Perfil e participação:</strong> foto, biografia, contato que você publica, favoritos, inscrições e relações com promotores dão suporte às funções que você utiliza.</li>
          <li><strong className="text-foreground">Eventos:</strong> dados da programação, local, imagens e conta publicadora permitem divulgar e administrar eventos. Informações públicas ficam acessíveis a outros visitantes.</li>
          <li><strong className="text-foreground">Comunidades e conexões:</strong> mensagens, votos, filas, salas, denúncias e perfis de conexões são utilizados para participação e moderação. A visibilidade depende do recurso; participar de conexões é opcional. Evite publicar dados sensíveis ou dados de terceiros sem necessidade.</li>
          <li><strong className="text-foreground">Localização:</strong> quando você solicita, o navegador pede permissão para usar suas coordenadas na centralização, nos filtros ou nas rotas. Em cálculos de trajeto, origem e destino são enviados ao Google. Você pode continuar buscando por endereço sem conceder localização.</li>
          <li><strong className="text-foreground">Segurança e funcionamento:</strong> registros técnicos, sessões e ações administrativas ajudam a prevenir abuso, controlar acesso e investigar falhas. Notificações push dependem de ativação no navegador e utilizam um identificador de inscrição.</li>
        </ul>
        <p className="text-muted-foreground">A base legal depende da finalidade, como execução dos serviços solicitados, cumprimento de obrigações legais e proteção de interesses legítimos, observados os direitos do titular. Quando a finalidade depender de consentimento, a escolha deve ser específica e revogável. O cadastro não representa uma autorização genérica para qualquer uso dos dados.</p>
      </section>

      <section aria-labelledby="privacy-providers" className="space-y-4">
        <h2 id="privacy-providers" className="text-xl font-semibold">Serviços de terceiros</h2>
        <p className="text-muted-foreground">O funcionamento utiliza hospedagem e banco de dados, entrega de e-mails transacionais e serviços de notificação. O acesso pelo Google utiliza a autenticação desse fornecedor; mapas, sugestões de endereço e trajetos usam Google Maps quando ativados. Esses serviços podem receber dados técnicos como IP, navegador e informações necessárias à operação escolhida.</p>
        <p className="text-muted-foreground">Ao abrir ingressos, calendários ou páginas externas, confira os avisos do serviço de destino. Dados podem ser processados em outros países, conforme a infraestrutura contratada; o responsável deve observar os mecanismos de transferência internacional previstos na LGPD e informar os fornecedores aplicáveis mediante solicitação.</p>
        <p className="text-muted-foreground">Consulte a <a href="https://policies.google.com/privacy?hl=pt-BR" target="_blank" rel="noopener noreferrer" className={linkClass}>política de privacidade do Google (abre em outra aba)</a>.</p>
      </section>

      <section id="preferencias" aria-labelledby="privacy-preferences" className="scroll-mt-24 space-y-5">
        <h2 id="privacy-preferences" className="text-xl font-semibold">Suas preferências</h2>
        <GoogleMapsPreference />
        <MetricPreference />
        <p className="text-muted-foreground">A permissão de localização é separada da ativação dos mapas. Você pode revogá-la nas configurações do site em seu navegador. Desativar uma integração não remove dados que o fornecedor já tenha recebido.</p>
      </section>

      <section aria-labelledby="privacy-cookies" className="space-y-4">
        <h2 id="privacy-cookies" className="text-xl font-semibold">Cookies e armazenamento local</h2>
        <p className="text-muted-foreground">Cookies de autenticação e segurança sustentam o login e protegem o acesso. O navegador também pode guardar sua preferência de tema, a abertura do menu lateral e rascunhos de eventos. Limpar os dados do site pode encerrar a sessão e remover essas preferências.</p>
        <ul className="list-disc space-y-3 pl-5 text-muted-foreground">
          <li><strong className="text-foreground">Menu lateral:</strong> o cookie <code>sidebar:state</code> guarda aberto/fechado por até 7 dias.</li>
          <li><strong className="text-foreground">Rascunho de evento:</strong> os campos ficam neste navegador, associados à conta, e deixam de ser recuperáveis pelo aplicativo após 7 dias. Imagens selecionadas não são incluídas no rascunho local.</li>
          <li><strong className="text-foreground">Google Maps:</strong> a escolha de ativação fica na aba, na chave <code>eventmap:maps-enabled</code>, sem coordenadas nessa preferência. O Google pode usar tecnologias próprias quando você ativa a integração.</li>
          <li><strong className="text-foreground">Métricas de eventos:</strong> contadores de visualizações e acessos a ingressos são agregados por evento e dia. Quando autorizadas, essas métricas utilizam cookies <code>eventmap_metric_*</code> por até uma hora para limitar repetições. O cookie <code>eventmap_metrics</code> guarda sua escolha por até 180 dias; você pode alterá-la nesta página.</li>
        </ul>
      </section>

      <section aria-labelledby="privacy-retention" className="space-y-4">
        <h2 id="privacy-retention" className="text-xl font-semibold">Conservação e exclusão</h2>
        <p className="text-muted-foreground">Dados de conta e participação são utilizados enquanto necessários às funções escolhidas. Você pode solicitar exclusão da conta, mensagens ou imagens pelo canal de privacidade. O pedido deve ser analisado também em relação aos dados associados, aos serviços contratados e às cópias de segurança.</p>
        <p className="text-muted-foreground">Alguns registros podem ser conservados quando houver obrigação legal, exercício regular de direitos ou outra hipótese permitida pela LGPD. O responsável deve informar o que será mantido, o motivo e o período aplicável. Cópias de segurança seguem o ciclo do provedor e precisam ser consideradas no atendimento; não prometemos remoção instantânea de todos os backups.</p>
      </section>

      <section aria-labelledby="privacy-rights" className="space-y-4">
        <h2 id="privacy-rights" className="text-xl font-semibold">Seus direitos</h2>
        <p className="text-muted-foreground">Você pode solicitar confirmação de tratamento, acesso, correção, informações sobre compartilhamento, anonimização, bloqueio ou eliminação quando cabíveis, portabilidade nos termos da regulamentação e revogação de consentimento. O responsável pode precisar confirmar sua identidade para proteger seus dados.</p>
        <p><Link href="/privacidade/solicitacoes" className={linkClass}>Veja como enviar uma solicitação de privacidade</Link>.</p>
        <p className="text-muted-foreground">Você também pode apresentar petição à <a href="https://www.gov.br/anpd/pt-br" target="_blank" rel="noopener noreferrer" className={linkClass}>ANPD (abre em outra aba)</a>. Alterações relevantes neste aviso serão publicadas nesta página, com a data de atualização.</p>
      </section>
    </article>
  </div>;
}
