# EventMap: relatório final da evolução comercial (ciclo 1)

Branch: `codex/produto-comercial-20261118`, base `origin/main` 1f536cd. Os relatórios detalhados de cada especialista estão nos arquivos 01 a 07 desta pasta.

## 1. Diagnóstico inicial

Para o público, o EventMap já é um produto maduro: descoberta por mapa, RSVP com vagas e lista de espera, QR rotativo, comunidade, chat, conexões e notificações. Para o organizador, que é quem paga, a experiência era rasa. Não havia entrada self-service, os resultados eram superficiais, não havia exportação nem equipe de check-in, e havia riscos operacionais que impediam vender o produto.

## 2. Principais problemas encontrados

- Editar um evento publicado tirava ele do ar: voltava para PENDING, a página dava 404 e as inscrições fechavam.
- Inscritos não eram avisados de cancelamento, mudança ou exclusão do evento.
- Não havia caminho para virar organizador. Eventos importados ficavam no nome do admin que os aprovou.
- Login e cadastro não tinham limite de tentativas e permitiam descobrir quais e-mails tinham conta.
- O e-mail transacional dependia do Gmail fixo.
- Excluir um usuário apagava em cascata dados de outras pessoas, como inscrições e conversas.
- Faltavam páginas 404 e de erro em pt-BR, havia vários `<main>` por página e não havia Termos de Uso.
- Bugs no mapa: os filtros eram apagados, a home remontava a cada mudança de sessão e havia geocodificação no navegador.
- O "Eventos IA" não usa IA: é uma importação verificada de 5 domínios.

## 3. Melhorias de front-end

- Estados globais (`not-found`, `error`, `global-error`) e skeletons de carregamento. Um carregamento que transformava 404 em 200 foi removido.
- Acessibilidade: um único `<main id="conteudo">`, link "Pular para o conteúdo", alvos de toque de 44 px e rótulos em pt-BR.
- Navegação sem rotas órfãs, com ícones distintos, sino de notificações no cabeçalho, link "Para organizadores" e rodapé global.
- Página do evento orientada a conversão: fatos principais no topo, botão fixo no celular, link "Adicionar ao Google Agenda", aviso LGPD no RSVP e eventos parecidos.
- Primitivas `StatusBadge` e `PageHeader`.
- Home renderizada no servidor, sem mudança visual. Framer Motion carregado sob demanda na home.

## 4. Novas funcionalidades

- **Resultados 2.0** (`/resultados`): funil visualizações → cliques → favoritos → inscrições → check-ins, avaliação média, filtro de 7/30/90 dias, ranking e aviso de consentimento.
- **Operação do evento:** check-in feito pela equipe (com e-mails mascarados), check-in manual com busca e exportação CSV protegida contra injeção.
- **Comunicação:** comunicados notificam os inscritos, inscritos são avisados de cancelamento e mudança, e há lembrete 24 h antes para quem confirmou presença.
- **Vitrine do promotor:** SEO/OG, próximos e realizados, feed `.ics` e JSON, widget incorporável `/embed/promotores/[id]`.
- **Aquisição B2B:** pedido "Quero publicar eventos", aviso automático ao ser promovido, "Sou o organizador" em eventos importados com transferência pelo admin, e página `/para-organizadores` com lista de interesse nos planos, sem preços inventados.
- **Recomendações explicáveis:** inscrições, categoria, "quem salvou X também salvou" e organizadores seguidos.

## 5. Back-end e arquitetura

- Edição sem tirar o evento do ar. Só mudanças sensíveis voltam para revisão: nome, data, hora, local, link, preço, redução de vagas, organização e capa.
- Catálogo `/api/AllEvents` compatível com o contrato anterior, com paginação opcional e imagens normalizadas.
- `GET /api/health` com teste do banco.

## 6. Segurança e desempenho

- Limite de tentativas persistente e compartilhado entre instâncias, sem mudar o schema. Respostas uniformes contra enumeração de contas, e-mail normalizado e mensagens de erro de login controladas.
- Cabeçalhos: HSTS em produção, nosniff, Referrer-Policy, Permissions-Policy e frame-ancestors (liberado só no `/embed`). A CSP completa segue em modo Report-Only.
- SMTP configurável com templates da marca, com fallback para o Gmail atual.
- Exclusão segura de usuário e auditoria das trocas de papel.
- O polling de 5 s do `ImpersonationGuard` foi removido para usuários comuns.

## 7. Diferenciais comerciais

Descoberta por mapa, RSVP com lista de espera automática, QR com check-in pela equipe, funil completo, comunidade e chat do evento num só lugar, e widget e calendário para o site do organizador.

## 8. Monetização recomendada (hipóteses, ver 06)

Piloto gratuito para organizadores selecionados, e depois os planos Pro e Enterprise (por organização e assentos de equipe). Os preços não foram definidos. Devem ser validados com entrevistas, com a lista de interesse que já está no ar e com pilotos. Para cobrar falta: provedor de pagamento, entitlements por plano, organizações multiusuário e termos revisados por advogado. Itens que exigem schema ficaram para o ciclo 2.

## 9. Arquivos e módulos

Cerca de 110 arquivos ao todo, entre novos e alterados. Os principais: `lib/services/{events,attendance,promoters,recommendations,userAdministration,credentials,registration}.ts`, `lib/{rateLimit,organizerInsights,eventImageUrl,googleCalendarLink}.ts`, `lib/mail/*`, `lib/organizer/*`, `lib/organizerOps/*`, `app/(private)/resultados`, `app/promotores/[id]`, `app/embed/*`, `app/api/{health,promotores,events/[id]/attendees}`, `app/(publicRoutes)/{termos,para-organizadores}`, `components/Providers/ClientProviders.tsx`, `components/MyComponents/{Map,EventoForm,EventPublicActions,SiteHeader,SiteFooter}.tsx`, `next.config.mjs`, `.github/workflows/ci.yml` e `scripts/run-offline-tests.cjs`.

## 10. Testes

- `npx tsc --noEmit` e `tsc -p tsconfig.server.json`: 0 erros.
- `npm run lint`: 0 avisos.
- `npm run test:offline`: **51/51 PASS**. Na base, as suítes `test:*` somavam 12 grupos.
- 6 novos scripts de verificação, um por pacote.
- `npm run build`: exit 0.
- Teste de fumaça HTTP: páginas novas 200, rota inexistente 404, rota privada 307, cabeçalhos do embed corretos e um único `<main>`.
- CI no GitHub Actions: typecheck, lint, test:offline e build.

## 11. Pendências

- **Paridade mobile:** a API do app ainda tira do ar eventos publicados quando são editados, não cancela inscrições no cancelamento, não tem check-in em equipe, revela contas existentes no cadastro, não limita tentativas e faz exclusão física de usuário. Os detalhes estão nos relatórios dos pacotes.
- Termos de Uso marcados como "versão 0.1 para validação jurídica".
- A CSP completa ainda está em Report-Only.
- Em produção, definir `TRUST_PROXY_IP=true` e, opcionalmente, as variáveis `SMTP_*`.
- Nada foi conferido num navegador real em 390 px nem com leitor de tela: a revisão foi feita no código e via HTTP.
- Agrupamento de pins no mapa (cluster), cron fora do servidor Socket.IO e workspace de organização (exige schema) ficaram para depois.

## 12. Próximas oportunidades

Organizações com papéis e assentos, billing com entitlements, destaque pago na vitrine, relatório pós-evento automático, digest semanal por interesse e ingresso nativo.

## Avaliação

| Critério | Nota (0 a 10) | Comentário |
|---|---|---|
| Qualidade técnica | 8 | Tipado, 51 suítes, CI e autorização revisada por revisores adversariais |
| Qualidade visual | 7 | Consistente com a identidade. Falta QA em navegador e celular real |
| Experiência do usuário | 7,5 | Fluxos de organizador completos. Falta o onboarding guiado |
| Potencial comercial | 8 | Proposta B2B clara para promotores recorrentes e casas |
| Maturidade para clientes | 7 | Pronto para pilotos assistidos |

**O que ainda impede a venda:** cobrança (provedor e planos), contas de organização multiusuário, termos revisados por advogado, paridade da API mobile e QA visual em dispositivos reais.
