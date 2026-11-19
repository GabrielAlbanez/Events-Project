# 06 — Monetização e mercado (EventMap)

> Auditoria somente leitura feita em 18/11/2026, na branch `codex/produto-comercial-20261118`. Cada afirmação técnica cita o arquivo e a linha que a sustentam. **Todos os preços, tamanhos de mercado e fatos sobre concorrentes são hipóteses a validar.** Nenhum preço deste documento foi verificado com clientes ou fontes externas.

## 1. Diagnóstico

O EventMap já tem um produto completo para **descobrir eventos** (mapa, agenda, recomendações, salas com amigos, conexões e chat) e um **conjunto inicial de ferramentas para organizadores**: rascunho, revisão, duplicação, recorrência, capacidade com lista de espera, check-in por QR assinado, comunidade do evento com equipe, filas e enquetes, além de métricas de interesse. Por outro lado, **não há nenhuma peça para cobrar**:

- Não existe provedor de pagamento, assinatura, plano, fatura nem limite de uso. Uma busca por `stripe|mercadopago|asaas|billing|checkout|premium|assinatura` em `app/`, `lib/` e `components/` não encontrou nada relacionado a cobrança. A lista de variáveis de ambiente lidas pelo código também não inclui chaves de pagamento.
- Ninguém consegue se tornar organizador sozinho. O cadastro cria `BASIC` (`prisma/schema.prisma:16`, com padrão `role Role @default(BASIC)`), e somente um administrador muda o papel, pela tabela de usuários (`components/MyComponents/UserTable.tsx:192-211` → `app/(actions)/alterRoleUser` → `lib/services/userAdministration.ts:72`). Nenhuma tela oferece "Quero divulgar meus eventos".
- Não existem Termos de Uso, termos do organizador nem página de preços: `GET /termos`, `/precos` e `/para-organizadores` devolvem **404** no servidor de desenvolvimento. Só existe a política de privacidade (`app/(publicRoutes)/privacidade/page.tsx`), que aparece no cadastro (`components/register-form.tsx:82`).
- A venda de ingressos acontece fora da plataforma. `priceCents` serve apenas para exibição (`components/MyComponents/EventoForm.tsx:181`), e o botão de ingressos abre um link externo (`components/MyComponents/EventPublicActions.tsx:100-119`). O próprio painel avisa que "Cliques em ingressos não representam vendas confirmadas" (`app/(private)/resultados/page.tsx:29`).

**Conclusão:** hoje o produto se vende como **ferramenta de divulgação, engajamento e operação de portaria para organizadores de pequeno e médio porte**, e não como bilheteria. A rota de monetização mais curta e com menos risco é **assinatura SaaS para organizadores (Pro)**, mais **destaque pago**, mantendo o participante gratuito. Bilheteria própria, com taxa por ingresso, fica para depois porque exige schema, um provedor de pagamento e trabalho jurídico (meia-entrada, reembolso, CDC).

## 2. Quem pagaria e por qual dor

| Segmento | Dor | O que o código já resolve | Disposição a pagar (hipótese) |
|---|---|---|---|
| **Organizador independente ou coletivo** (festas, shows pequenos, workshops, eventos culturais recorrentes) | Divulgar além do Instagram, encher a lista, controlar a entrada sem planilha e reaproveitar a próxima edição | Mapa e descoberta, perfil público com seguidores (`lib/services/promoters.ts:4-10`), recorrência (`lib/services/recurrence.ts:7`), duplicação (`lib/services/events.ts:97`), capacidade e lista de espera transacional (`lib/services/attendance.ts:93-115`), check-in por QR com HMAC (`lib/services/attendance.ts:150-210`) | **Alta.** É o pagador principal |
| **Casa de shows, bar, espaço cultural** (venue) | Agenda recorrente, equipe de portaria e público fiel | Recorrência semanal ou mensal (`prisma/schema.prisma:258-275`), seguidores e notificações automáticas de mudança (`lib/services/events.ts:73-76`) | **Média a alta.** Precisa de multiusuário e de vários eventos ativos |
| **Produtora ou agência** (vários eventos e clientes) | Operar vários organizadores, ter relatórios e marca | Ainda não há conceito de organização: todo evento pertence a um `userId` (`prisma/schema.prisma:117`) | Alta, mas exige schema (Enterprise) |
| **Marcas e patrocinadores** | Alcançar público local por categoria e região | Categoria, latitude e longitude por evento (`prisma/schema.prisma:126-131`), recomendação por categoria, proximidade e seguidos (`lib/eventRecommendations.ts`) | Média. Depende de volume de audiência (hipótese) |
| **Participante** | Encontrar o que fazer, combinar com amigos e conhecer pessoas no evento | Salas com amigos, conexões e chat (`docs/community.md`, `docs/party-connections-ux.md`) | **Baixa.** Deve continuar gratuito; cobrar dele reduz o efeito de rede |
| **Prefeituras, secretarias de cultura, shoppings** (B2G/B2B) | Agenda cultural oficial e georreferenciada | Mapa, moderação e importação de fontes curadas (`lib/aiEvents/provider.ts:8`) | Hipótese de licenciamento Enterprise ou white-label |

## 3. Posicionamento frente às categorias concorrentes (hipóteses)

> Este documento não cita preços nem números de concorrentes. As descrições abaixo são **posicionamentos de categoria** a confirmar com pesquisa de mercado.

| Categoria | Exemplos | Como o EventMap se posiciona (hipótese) |
|---|---|---|
| Bilheteria e plataforma de inscrições | Sympla, Eventbrite | Essas plataformas monetizam a transação. O EventMap **não vende ingressos**: complementa a bilheteria (o link externo continua) e cobra pela **audiência e pela operação**. Venda mensagem de "use sua bilheteria atual e ganhe mapa, comunidade e portaria". |
| Bilheteria para festas e cena noturna | Shotgun | Parecida em público jovem e social. O diferencial do EventMap são as conexões dentro do evento (match e chat liberados só com inscrição confirmada, `docs/party-connections-ux.md`) e as salas com amigos. |
| Comunidades e grupos recorrentes | Meetup | O EventMap tem seguidores, recorrência e comunidade por evento (perguntas, enquetes, filas, equipe, achados e perdidos, avaliação; `docs/community.md`). Falta o "grupo" persistente entre eventos, que depende de schema. |
| Curadoria de experiências | Fever | A curadoria é feita pela moderação do admin (todo envio vira `PENDING`, `lib/services/events.ts:55`) e pela importação curada. É possível vender um selo de curadoria e destaque. |
| Substitutos gratuitos | Google Maps/Busca, Instagram, WhatsApp | São o maior concorrente real. O EventMap precisa provar ganho mensurável: o funil de visualização até check-in (seção 6), a portaria e as notificações a seguidores. O `planInvite` já gera texto para WhatsApp (`lib/planInvite.ts`). |

## 4. Diferenciais reais (sustentados por código)

1. **Mapa e descoberta geolocalizada**, com filtros, agenda pessoal e recomendação explicável ("De um organizador que você segue", `lib/eventRecommendations.ts`).
2. **Inscrição com lista de espera transacional e promoção automática**, com transações `Serializable` e retry (`lib/services/attendance.ts:21-30, 48-65`).
3. **Check-in por QR assinado com HMAC, válido por 5 minutos e com rotação de versão** (`lib/services/attendance.ts:8, 150-158, 110-111`), com câmera pelo `BarcodeDetector` e entrada manual como alternativa (`app/(private)/myEvents/[id]/checkin/page.tsx:93-140`).
4. **Comunidade do evento em tempo real**: comunicados, perguntas, enquetes, filas, equipe e tarefas, avaliação pós-evento (`prisma/schema.prisma:410-478`, `lib/community/events.ts:74-76`).
5. **Conexões sociais no evento**, com match, chat, bloqueio e denúncia (`prisma/schema.prisma:546-634`), reservadas a inscritos confirmados.
6. **Fluxo editorial profissional**: rascunho, revisão, pedido de correção, histórico de auditoria (`EventHistory`, `prisma/schema.prisma:304-318`), duplicação e recorrência.
7. **Privacidade e LGPD como argumento de venda**: consentimento de métricas (`app/api/event-engagement/[id]/route.ts:8`), canal de solicitações (`app/(publicRoutes)/privacidade/solicitacoes/page.tsx`) e auditoria de personificação.
8. **Importação de eventos de fontes oficiais curadas**, sem LLM: leitura de dados estruturados em domínios permitidos (`lib/aiEvents/provider.ts:8`).

## 5. Gratuito x pago e empacotamento (limites mapeados para recursos existentes)

> Os limites são **hipóteses de empacotamento** e devem ser validados. Todos os recursos citados já existem; o que falta é a camada que aplica os limites (ver O4).

| Recurso existente | Participante (grátis) | **Organizador Grátis** | **Pro** (organizador ou venue) | **Enterprise** (produtora, órgão público) |
|---|---|---|---|---|
| Descoberta, agenda, salas, conexões, chat | ✔ | ✔ | ✔ | ✔ |
| Eventos publicados ativos (`Events.status=PUBLISHED`) | — | 1 a 2 simultâneos (hipótese) | Ilimitado ou alto | Ilimitado |
| Imagens do carrossel (`lib/services/events.ts:49`, hoje até 10) | — | 3 | 10 | 10 |
| Recorrência (`EventSeries.count`) | — | ✖ | ✔ | ✔ |
| Capacidade e lista de espera (`attendance.ts`) | — | ✔ (até N inscrições, hipótese) | ✔ | ✔ |
| Check-in por QR | — | ✔ para eventos pequenos | ✔ e equipe de portaria (O6) | ✔ e vários portões |
| Comunidade: filas, tarefas, equipe | — | Perguntas e enquetes | Tudo, com equipe de até X pessoas | Equipe ilimitada |
| Resultados (`/resultados`) | — | Totais | Funil completo, série diária e avaliações (O5) | E exportação |
| Exportar participantes CSV (O7) | — | ✖ | ✔ | ✔ e API |
| Notificação a seguidores (`notifyEventAudience`) | — | ✔ | ✔ | ✔ |
| Destaque na home ou no mapa (O10) | — | Avulso | Créditos mensais | Pacote |
| Selo de organizador verificado | — | ✖ | ✔ | ✔ |
| Organização multiusuário (O11, exige schema) | — | ✖ | ✖ | ✔ |
| Importação de fontes, agenda oficial white-label | — | ✖ | ✖ | ✔ |

**Ciclos de cobrança (hipótese):** mensal e anual, com desconto anual a testar (por exemplo, 2 meses grátis). O Pro pode ter **assento extra para a equipe de portaria** (cobrança por assento) depois de O6. No Enterprise, licença anual com contrato, SLA e faturamento por boleto ou nota fiscal.

**Trial (hipótese):** 14 dias de Pro sem cartão, ativado quando o organizador publica o primeiro evento. Também cabe um **"Pro por evento"** (passe avulso para um único evento), adequado a quem faz poucos eventos por ano.

**Faixas de preço:** **não definidas**. Para validar: (a) de 10 a 15 entrevistas com organizadores de pequeno porte, usando o método Van Westendorp (quatro perguntas de preço); (b) uma landing `/para-organizadores` com três planos e preços em teste A/B, medindo cliques em "Assinar" (fake door); (c) um piloto pago "concierge" com 3 a 5 organizadores, cobrados por link de pagamento manual.

## 6. Alavancas de retenção e churn

- **Recorrência e duplicação** prendem o ciclo de edições (`lib/services/recurrence.ts`, `lib/services/events.ts:97`). O plano pode lembrar "crie a próxima edição" quando um evento termina (`status=ENDED`).
- **Seguidores** viram um ativo do organizador (`Follow`, `lib/services/promoters.ts:12`). Perder a base acumulada ao cancelar é um custo de troca saudável, desde que os dados continuem exportáveis por LGPD.
- **Funil e prova de valor**: os dados de visualizações, cliques, favoritos, inscrições, check-ins e avaliações já existem em tabelas diferentes (`EventMetric`, `Favorite`, `EventRegistration`, `CommunityFeedback`). Hoje `getPromoterStats` mostra só visualizações, cliques e favoritos (`lib/services/promoters.ts:63-69`).
- **Relatório pós-evento por e-mail** (já existe infraestrutura de e-mail em `lib/mail/`), com comparecimento e avaliação média, como gatilho de renovação.
- **Risco de churn**: as métricas dependem de consentimento (`app/api/event-engagement/[id]/route.ts:8`) e por isso **subcontam** o interesse real. Um painel com números baixos desestimula a renovação (ver O8).
- **Sazonalidade**: organizadores pausam entre temporadas. Um plano "pausado" ou o passe por evento reduzem cancelamentos.

## 7. O que falta tecnicamente para cobrar

| Peça | Existe? | Precisa de schema? | Versão sem schema |
|---|---|---|---|
| Página de preços e landing para organizadores | Não (404) | Não | Sim: página estática e CTA |
| Termos de Uso, termos do organizador, política de conteúdo e de reembolso | Não | Não, mas o registro da versão aceita exige schema | Sim: página e texto no cadastro; prova de aceite fica limitada |
| Pedido para virar organizador | Não (só o admin muda papel) | Não, se o pedido for por e-mail | Sim: formulário que envia e-mail ao admin (`lib/mail`) |
| Entitlements (plano → limites) | Não | Sim, para plano por usuário | Parcial: limites por `Role`, em configuração (`PROMOTER` = pago) |
| Provedor de pagamento (assinatura, Pix, cartão, boleto) | Não | **Sim** (`Subscription`, `BillingCustomer`, `Invoice`, eventos de webhook) | Sim, "concierge": link de pagamento manual, e o admin promove o papel |
| Webhooks idempotentes, dunning, faturas e nota fiscal | Não | Sim | Não |
| Medição de uso (eventos ativos, inscrições, assentos) | Parcial (contagens possíveis via Prisma) | Não para contar | Sim |
| Organização multiusuário e assentos | Não (o evento pertence a `userId`) | Sim | Parcial, reaproveitando `CommunityTeamMember` por evento |
| Destaque pago | Não | Sim, para `featuredUntil` | Sim, para piloto: lista de IDs em configuração mantida pelo admin |
| Bilheteria própria e repasse | Não | Sim (pedidos, itens, repasses) | Não |

## 8. Recursos "visuais" ou parciais que afetam a venda

- `priceCents` e `isFree` só aparecem na tela; não há cobrança (`components/MyComponents/EventoForm.tsx:181`, `components/MyComponents/EventPublicActions.tsx:119`).
- O papel `PROMOTER` só é concedido manualmente pelo admin (`components/MyComponents/UserTable.tsx:192-211`); não há fluxo de solicitação.
- A equipe do evento (`CommunityTeamMember`) **não pode fazer check-in**: o roster e a validação aceitam apenas o dono ou um ADMIN (`lib/services/attendance.ts:189` e `:199`).
- A câmera do check-in depende de `BarcodeDetector` (`app/(private)/myEvents/[id]/checkin/page.tsx:93-97`). Em navegadores sem essa API, a portaria precisa digitar o token manualmente.
- "Eventos IA" (`app/(adminRoutes)/admin/eventos-ia`) não usa um modelo de IA: é um parser de dados estruturados em domínios fixos (`lib/aiEvents/provider.ts:8`). O nome pode gerar expectativa errada em uma venda. Importar conteúdo de bilheterias de terceiros também pede revisão jurídica dos termos dessas fontes (hipótese de risco).
- As métricas de visualização e clique só contam com consentimento (`app/api/event-engagement/[id]/route.ts:8`), então ficam subestimadas.
- O painel `/resultados` não mostra inscrições, check-ins nem avaliações, embora esses dados existam (`lib/services/promoters.ts:63-69`).

## 9. Oportunidades priorizadas

### O1 (P0) — Autoatendimento para virar organizador
- **Problema:** um visitante que quer divulgar um evento não tem caminho. Só o admin promove alguém a `PROMOTER` (`UserTable.tsx:192-211`, `lib/services/userAdministration.ts:72`), e as rotas de organizador ficam bloqueadas para `BASIC` (`roles.ts`, `lib/authPolicy.ts:39`).
- **Solução sem schema:** criar a página `/para-organizadores` com um formulário (nome do organizador, cidade, link do Instagram ou site, frequência de eventos) que envia e-mail ao admin pela infraestrutura de `lib/mail/` e cria uma notificação para os admins (`Notification`, já usada em `notifyEventAudience`). O admin aprova pelo `UserTable` existente. Incluir CTA "Divulgar meu evento" no header público e no perfil `BASIC`.
- **Arquivos:** `app/(publicRoutes)/para-organizadores/page.tsx` (novo), `roles.ts` (`publicRoutes`), `components/MyComponents/SiteHeader.tsx`, `app/(private)/Profile/page.tsx`, `lib/mail/`.
- **Com schema (futuro):** um modelo `PromoterApplication` com status, para fila de aprovação no admin.

### O2 (P0) — Termos de Uso, termos do organizador e política de conteúdo
- **Problema:** não há base contratual para cobrar, moderar ou remover conteúdo. `/termos` devolve 404, e o cadastro cita apenas a privacidade (`components/register-form.tsx:82-83`).
- **Solução sem schema:** criar páginas estáticas `/termos` e `/termos/organizadores` (responsabilidade pelo conteúdo e pelo link de ingresso, proibições, moderação, cancelamento e reembolso de assinatura, foro) e linká-las no cadastro, no rodapé e no `EventoForm`. Registrar a versão aceita exige schema (`termsVersion`, `termsAcceptedAt`); sem ela, documentar a versão vigente por data. **Texto deve passar por revisão jurídica.**
- **Arquivos:** `app/(publicRoutes)/termos/page.tsx` (novo), `roles.ts`, `components/register-form.tsx`, `components/MyComponents/EventoForm.tsx`.

### O3 (P0) — Landing de preços com fake door
- **Problema:** não há como medir disposição a pagar (`/precos` devolve 404).
- **Solução sem schema:** criar `/precos` com Grátis, Pro e Enterprise (tabela da seção 5) e botões "Começar teste" e "Falar com vendas". O botão abre o formulário da O1, ou um formulário de interesse que dispara e-mail. Registrar o interesse só por e-mail, ou por analytics com consentimento. Testar duas faixas de preço.
- **Arquivos:** `app/(publicRoutes)/precos/page.tsx`, `roles.ts`, `components/MyComponents/SiteHeader.tsx`.

### O4 (P1) — Camada de entitlements configurável
- **Problema:** não existe o conceito de limite por plano. As regras de autorização estão espalhadas pelos services (`lib/services/events.ts:11-16`, `lib/services/recurrence.ts:9`, `lib/services/promoters.ts:46`).
- **Solução sem schema:** criar `lib/plans.ts` com `getEntitlements(user)`, que no início mapeia `Role` para limites (`PROMOTER` = Pro, e um modo "grátis" com limite de eventos ativos e de imagens). Aplicar em `save()` (`lib/services/events.ts:27`), em `criarSerieRecorrente` e no `team.add` da comunidade (`lib/community/events.ts:74`). As mensagens devem convidar ao upgrade, e não falhar sem explicação.
- **Com schema:** `User.plan` ou um modelo `Subscription`.

### O5 (P1) — Funil completo em Resultados
- **Problema:** `getPromoterStats` (`lib/services/promoters.ts:63-69`) devolve só visualizações, cliques e favoritos, sem inscrições, check-ins, lista de espera nem avaliação, embora `EventRegistration` e `CommunityFeedback` existam.
- **Solução sem schema:** adicionar `_count` de `registrations` por status e a média de `communityFeedback.rating` à consulta, e mostrar o funil em `app/(private)/resultados/page.tsx`, com taxa de comparecimento (CHECKED_IN sobre CONFIRMED). É a principal "prova de valor" do Pro.
- **Arquivos:** `lib/services/promoters.ts`, `app/(private)/resultados/page.tsx`, `app/(actions)/engagement/action.ts`.

### O6 (P1) — Equipe de portaria no check-in (base para cobrança por assento)
- **Problema:** só o dono ou um ADMIN fazem check-in (`lib/services/attendance.ts:189, 199`). Em evento real, a portaria é feita por outras pessoas. A câmera depende de `BarcodeDetector` (`checkin/page.tsx:93-97`).
- **Solução sem schema:** liberar o check-in e o roster para membros de `CommunityTeamMember` do evento, reaproveitando `lib/community/access.ts:10`, e ajustar `lib/authPolicy.ts:25`, que hoje exige PROMOTER ou ADMIN na rota `/myEvents/[id]/checkin`. Fallback de leitura de QR fica para o time de frontend (não adicionar dependência sem aprovação).
- **Arquivos:** `lib/services/attendance.ts`, `lib/authPolicy.ts`, `app/api/events/[id]/check-in/route.ts`, `app/(private)/myEvents/[id]/checkin/page.tsx`.

### O7 (P1) — Exportar participantes (CSV)
- **Problema:** o organizador não consegue levar a lista para a portaria offline ou para o seu CRM. `getCheckInRoster` já monta os dados (`lib/services/attendance.ts:187-195`).
- **Solução sem schema:** criar um handler GET autenticado `app/api/events/[id]/registrations/export/route.ts` que reaproveita `getCheckInRoster`, com a mesma checagem de dono e cabeçalhos `no-store`. Exportar só nome, status e horário de check-in. E-mail apenas com base legal definida (LGPD) e registro em auditoria.

### O8 (P1) — Métricas confiáveis sem dado pessoal
- **Problema:** sem o cookie de consentimento, visualizações e cliques não são contados (`app/api/event-engagement/[id]/route.ts:8`, `EventPublicActions.tsx:119`). O painel subestima resultados e prejudica a renovação.
- **Solução sem schema:** contar de forma **agregada e anônima** (incremento diário em `EventMetric`, sem cookie de deduplicação) quando não houver consentimento, e manter a deduplicação por cookie só com consentimento. O painel deve indicar que os números são agregados. **Exige validação jurídica do legítimo interesse.**

### O9 (P1) — Cobrança: concierge agora, provedor depois
- **Problema:** não existe nenhuma integração de pagamento.
- **Solução sem schema (piloto):** cobrança manual por link de pagamento do provedor escolhido. O admin promove o papel no `UserTable` e registra a operação no histórico de auditoria. Permite cobrar dos 3 a 5 primeiros clientes.
- **Com schema e credenciais:** modelos `BillingCustomer`, `Subscription` (plano, status, `currentPeriodEnd`), `Invoice` e `BillingEvent` (idempotência de webhook). Rota `app/api/billing/webhook/route.ts`, portal do cliente e dunning. A escolha do provedor (suporte a Pix, boleto, cartão e nota fiscal) é uma hipótese a avaliar.

### O10 (P1) — Destaque pago e vitrine patrocinada
- **Problema:** não há inventário publicitário. A home e o mapa só ordenam por relevância (`lib/eventRecommendations.ts`).
- **Solução sem schema (piloto):** criar `lib/featuredEvents.ts` com uma lista de IDs e datas mantida pelo admin em configuração, e mostrar um selo "Destaque" (com identificação de publicidade) na home e em `/EventsCreated`. Cobrar avulso e manualmente.
- **Com schema:** `featuredUntil` e `featuredPlacement` em `Events`, com compra self-service.

### O11 (P2) — Organização multiusuário (Enterprise)
- **Problema:** todo evento pertence a um único usuário (`prisma/schema.prisma:117`). Produtoras e casas precisam de várias pessoas com papéis diferentes.
- **Solução:** criar `Organization` e `OrganizationMember` (owner, editor, portaria) e migrar `Events.userId` para `organizationId`, opcional no início. **Exige schema.** Sem schema, só a equipe por evento (`CommunityTeamMember`) atende parcialmente.

### O12 (P2) — Bilheteria nativa com taxa por ingresso
- **Problema:** a receita por transação fica toda com a bilheteria externa (`linkParaCompra`).
- **Solução:** pedidos, lotes, repasse ao organizador, reembolso, meia-entrada e nota fiscal. **Exige schema, credenciais e trabalho jurídico.** Recomendo só depois de validar O1 a O9. Uma alternativa intermediária, que pode ser feita sem schema, é usar link de afiliado ou parceria com a bilheteria (hipótese).

## 10. Plano de validação (sem código pesado)

1. **Semanas 1 e 2:** entrevistas com 10 a 15 organizadores (independentes, casas e coletivos), cobrindo as dores da seção 2, como divulgam hoje e quanto gastam em impulsionamento (hipótese a medir), além das quatro perguntas de preço do método Van Westendorp.
2. **Semanas 2 a 4:** publicar O1, O2 e O3, divulgar a landing para organizadores e medir a taxa de clique em "Começar teste" por faixa de preço.
3. **Semanas 4 a 8:** piloto concierge (O9) com 3 a 5 organizadores e entrega de O5, O6 e O7. Métricas: eventos publicados por organizador, inscrições, check-ins, retenção no segundo mês e NPS.
4. **Decisão:** se houver pagamento recorrente e retenção, investir em O4 com schema e no provedor de pagamento.

## 11. Riscos

- Cobrar o participante prejudica o efeito de rede. Recomendo manter o participante gratuito.
- Moderação manual de todo evento (`lib/services/events.ts:55`) não escala com muitos organizadores gratuitos. Cabe avaliar uma fila prioritária ou publicação automática para organizadores verificados (decisão de produto e de confiança).
- Conexões e "paquera" (`adultDeclared`) aumentam o risco reputacional para venda B2B e para marcas. Convém ter um interruptor por evento antes de vender para órgãos públicos.
- A importação de fontes de terceiros precisa de revisão jurídica antes de virar recurso comercial.
- Armazenamento de mídia em disco local (`docs/party-connections-ux.md`, seção "Persistência") limita SLA em planos pagos.
