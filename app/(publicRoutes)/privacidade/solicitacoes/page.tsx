import type { Metadata } from "next";
import Link from "next/link";
import { PrivacyRequestForm } from "@/components/MyComponents/PrivacyRequestForm";
import { privacyConfig } from "@/lib/privacy";

export const metadata: Metadata = { title: "Seus dados e direitos", description: "Como solicitar acesso, correção ou exclusão dos seus dados no EventMap." };

export default function PrivacyRequestsPage() {
  return <div className="w-full min-w-0 px-4 py-8 sm:px-6 lg:px-10">
    <article className="mx-auto max-w-3xl space-y-10 pb-12">
      <header className="space-y-4">
        <Link href="/privacidade" className="inline-flex min-h-11 items-center rounded-md font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">← Política de privacidade</Link>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Seus dados e direitos</h1>
        <p className="text-base leading-7 text-muted-foreground">Peça informações sobre seus dados, corrija o que estiver errado ou solicite exclusão. Você não precisa entrar na conta para entrar em contato.</p>
      </header>
      <section aria-labelledby="privacy-request-title" className="space-y-5 rounded-2xl bg-muted/40 p-5 sm:p-7">
        <h2 id="privacy-request-title" className="text-xl font-semibold">Fale com o responsável</h2>
        {privacyConfig.contactEmail ? <PrivacyRequestForm contactEmail={privacyConfig.contactEmail} /> : <p role="status" className="leading-7">O endereço de atendimento de privacidade ainda não foi informado pelo responsável pelo EventMap. O envio de solicitações por esta página está indisponível até que esse contato seja publicado.</p>}
      </section>
      <section aria-labelledby="privacy-next-title" className="space-y-4">
        <h2 id="privacy-next-title" className="text-xl font-semibold">O que acontece depois</h2>
        <ol className="list-decimal space-y-3 pl-5 text-base leading-7 text-muted-foreground">
          <li>Envie seu pedido, de preferência pelo e-mail associado à conta, e explique quais dados ou recursos estão envolvidos.</li>
          <li>O responsável poderá confirmar sua identidade de maneira proporcional ao pedido, sem exigir informações excessivas.</li>
          <li>A resposta deve informar o atendimento, eventuais dados conservados por obrigação legal e os motivos de uma recusa, quando aplicável.</li>
        </ol>
        <p className="leading-7 text-muted-foreground">Para confirmação da existência de tratamento ou acesso aos dados, a LGPD prevê resposta simplificada imediata ou declaração completa em até 15 dias. Outros pedidos serão analisados conforme a lei e a regulamentação aplicáveis.</p>
      </section>
      <section aria-labelledby="privacy-delete-title" className="space-y-4">
        <h2 id="privacy-delete-title" className="text-xl font-semibold">Sobre a exclusão</h2>
        <p className="leading-7 text-muted-foreground">Solicitar a exclusão não apaga automaticamente informações de terceiros ou registros que precisem ser conservados legalmente. O responsável deve explicar o alcance da remoção, incluindo mensagens, imagens e eventuais cópias de segurança. Não há exclusão automática ao abrir este formulário.</p>
        <p className="leading-7 text-muted-foreground">Você também pode pedir informações sobre as finalidades, os compartilhamentos e a base legal utilizada, revogar consentimentos e exercer os demais direitos previstos na LGPD.</p>
      </section>
    </article>
  </div>;
}
