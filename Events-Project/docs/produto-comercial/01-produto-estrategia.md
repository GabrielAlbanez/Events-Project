# 01 — Produto e estratégia comercial (EventMap)

> Auditoria de produto, somente leitura, sobre a worktree `codex/produto-comercial-20261118` (origin/main, commit `1f536cd`). Cada afirmação cita o arquivo e a linha lidos. Páginas confirmadas por GET no servidor de desenvolvimento (`/`, `/EventsCreated`, `/demonstracao`, `/privacidade`, `/sitemap.xml`, `/robots.txt` e `/api/AllEvents` responderam 200; `/myEvents` e `/resultados` redirecionaram com 307 para quem não está logado; `/promotores/inexistente` respondeu 404). O sitemap tem só 9 URLs, ou seja, o catálogo publicado hoje é muito pequeno.

## 1. Diagnóstico em uma página

O EventMap já é mais que um "mapa de eventos". Ele cobre o **ciclo do participante** inteiro: descobrir (mapa, filtros, recomendações), salvar e receber lembretes, confirmar presença com vagas e lista de espera, receber passe QR, fazer check-in, conversar no chat do evento, participar da comunidade (perguntas, enquetes, programação, filas, achados e perdidos) e conhecer pessoas (Conexões da festa).

O lado do **organizador** é bem mais raso. Hoje o organizador é **uma conta individual** (`Role` = BASIC | ADMIN | PROMOTER, `prisma/schema.prisma:80-84`), sem organização, sem equipe com permissões sobre o evento (exceto a equipe da comunidade), sem exportação, sem e-mail transacional profissional e sem cadastro próprio de organizador. Para um comprador B2B, o produto ainda não "fecha a venda". O valor existe para o participante, mas o organizador não consegue entrar sozinho, operar o evento com a equipe nem levar dados embora.

Há também um risco operacional grave para quem publica. **Qualquer edição de um evento publicado tira o evento do ar** até um admin aprovar de novo. `lib/services/events.ts:55` define `PENDING` quando `existing.status === "PUBLISHED"`; `lib/eventQueries.ts:21` só mostra PUBLISHED/CANCELLED/ENDED; e `lib/services/attendance.ts:34` fecha as inscrições quando o status não é PUBLISHED.

## 2. Visão de produto

**"A camada de experiência do evento: do primeiro clique no mapa até o pós-evento, com dados que o organizador pode usar."**

O ingresso fica com Sympla, Eventim e similares. O EventMap ocupa o que vem **antes** (descoberta e intenção), **durante** (check-in, comunidade, chat, conexões) e **depois** (avaliação, seguidores, recorrência) da compra. Esse posicionamento conversa com o código que já existe: o link de ingresso é externo (`components/MyComponents/EventPublicActions.tsx:119`), e a própria tela de resultados diz que "Cliques em ingressos não representam vendas confirmadas" (`app/(private)/resultados/page.tsx:29`).

## 3. Personas e compradores (validados pelo código)

| Persona | O que o código já oferece | Lacuna |
|---|---|---|
| **Participante** (público final, vida noturna e cultura urbana) | Mapa, filtros, recomendações (`lib/eventRecommendations.ts`), favoritos com lembrete (`Favorite.reminderMinutes`, `schema.prisma:320-331`), agenda ICS (`app/api/my-calendar/route.ts:12`), RSVP com lista de espera (`lib/services/attendance.ts:93-116`), passe QR, chat, conexões e salas de amigos | Nenhuma lacuna bloqueante |
| **Promotor / produtor independente** (comprador nº 1) | Criar evento com rascunho, recorrência semanal ou mensal (`EventoForm.tsx:78,140-150`), duplicação (`duplicarEvento` em `lib/services/events.ts`), check-in por QR (`app/(private)/myEvents/[id]/checkin/page.tsx`), métricas básicas (`lib/services/promoters.ts:63`), perfil público com seguidores (`app/promotores/[id]/page.tsx`) | Não consegue virar promotor sozinho; edição tira o evento do ar; sem exportação; check-in só pelo dono |
| **Casa de shows / venue** | Mesmo fluxo do promotor, com recorrência | Sem conceito de local ou organização, sem widget ou feed para o site próprio |
| **Órgão de turismo / prefeitura** | Importação verificada de eventos de fontes oficiais por cidade (`lib/aiEvents/catalog.ts`, 12 capitais), mapa público, JSON-LD de evento (`app/eventos/[id]/page.tsx:39`) | Sem multi-tenant, sem marca própria, sem exportação de agenda pública |
| **Universidade / atlética** | RSVP gratuito, capacidade, check-in, comunidade com tarefas de equipe (`lib/community/events.ts:74-76`) | Sem domínio de e-mail institucional e sem equipe por organização |
| **Marca de vida noturna** | Conexões da festa (`PartyProfile`/`PartyMatch`), comunidade | Sem métricas agregadas de engajamento social para o patrocinador |
| **Admin / moderação EventMap** (operador interno) | Revisão de eventos, denúncias (eventos e conexões), suspensão auditada (`UserSuspensionAudit`), impersonação auditada (`ImpersonationSession`), importação de eventos | Sem painel de saúde da plataforma (KPIs globais) |

**Comprador prioritário:** promotores e produtores independentes, depois venues. O código atende melhor quem organiza **festas e eventos recorrentes com público que confirma presença**, como mostram o check-in, a lista de espera, as conexões da festa e a recorrência.

## 4. Jobs-to-be-done

1. *Quando estou livre na sexta, quero ver o que acontece perto de mim e com quem eu iria*: mapa, filtros, recomendações, salas de amigos (`app/(private)/salas`).
2. *Quando decido ir, quero garantir a vaga e não esquecer*: RSVP, lista de espera, lembrete, ICS.
3. *Na porta, quero entrar rápido*: passe QR com expiração (a tela de check-in informa que o código expira em cinco minutos).
4. *Como organizador, quero lotar o evento e saber de onde vem o público*: métricas (parcial), seguidores e aviso aos seguidores (`lib/eventNotifications.ts:15-16`).
5. *Como organizador, quero operar o dia do evento com minha equipe*: equipe e tarefas na comunidade existem; check-in delegado **não existe** (`lib/services/attendance.ts:189,199`).
6. *Como organizador, quero falar com quem confirmou presença*: comunicados existem, mas **não notificam ninguém** (`lib/community/announcements.ts:8`).
7. *Depois do evento, quero provar resultado ao patrocinador ou ao venue*: a avaliação existe (`CommunityFeedback`, `lib/community/events.ts:45`), mas não aparece em `/resultados` e não há exportação.

## 5. Inventário de funcionalidades e maturidade

Legenda: **Sólida** = fluxo completo da tela ao banco, com regras e scripts de verificação · **Parcial** = funciona, mas falta algo essencial para uso comercial · **Só visual/não conectada** = interface sem efeito real ou com efeito limitado.

| Área | Rotas e arquivos | Maturidade | Observação |
|---|---|---|---|
| Descoberta pública (home, agenda, mapa) | `app/page.tsx`, `app/(publicRoutes)/EventsCreated`, `components/MyComponents/Map.tsx` | Sólida | O Google Maps é opcional e só carrega com consentimento (`GoogleMapsPreference.tsx`), com fallback para lista |
| Página pública do evento + SEO | `app/eventos/[id]/page.tsx:26-39`, `app/sitemap.ts`, `app/robots.ts` | Sólida | `generateMetadata`, OG e JSON-LD `Event` com `Offer` e `organizer` |
| Perfil do promotor | `app/promotores/[id]/page.tsx`, `lib/services/promoters.ts:4-11` | Parcial | **Sem `generateMetadata`/OG**; não separa próximos e passados; sem marca |
| Criar, editar, rascunho, recorrência, duplicar | `app/(private)/CriarEvento`, `EventoForm.tsx`, `lib/services/events.ts` | Parcial | Editar um evento publicado volta para PENDING e **tira o evento do ar** (`events.ts:55`) |
| Moderação de eventos | `app/(actions)/validateEvents`, `ModalEventsValidate.tsx`, `EventHistory` | Sólida | O histórico guarda um snapshot mesmo após a exclusão (`schema.prisma:304-318`) |
| RSVP, capacidade, lista de espera | `app/api/events/[id]/registration`, `lib/services/attendance.ts:93-150` | Sólida | Transação serializável e promoção automática da espera com notificação |
| Check-in por QR | `app/(private)/myEvents/[id]/checkin/page.tsx`, `lib/services/attendance.ts:153-200` | Parcial | Só dono ou admin; sem busca na lista, sem check-in manual por nome, sem exportação; atualização por polling de 10 s |
| Métricas do organizador | `app/(private)/resultados/page.tsx`, `lib/services/promoters.ts:63-68` | Parcial | Mostra só views, cliques e favoritos. A medição depende de opt-in (`app/api/event-engagement/[id]/route.ts:7`) e a página não avisa. Sem inscrições, check-ins, avaliação ou período |
| Seguidores e aviso de novos eventos | `Follow`, `lib/eventNotifications.ts:5-16` | Sólida | — |
| Comunidade do evento | `app/eventos/[id]/comunidade`, `lib/community/*` | Sólida | Perguntas, enquetes, programação, filas, achados e perdidos, equipe e tarefas, avaliação |
| Comunicados da organização | `lib/community/announcements.ts` | Parcial / passivo | Publicar não gera notificação nem push para quem confirmou presença |
| Chat do evento (participantes) | `app/eventos/[id]/chat`, `lib/eventChat`, `EventChatMessage` | Sólida | Restrito a confirmados |
| Conexões da festa | `app/eventos/[id]/conexoes`, `lib/partyConnections/*` | Sólida | Match mútuo, bloqueio, denúncia; paquera exige declaração de maioridade (`lib/partyConnections/profile.ts:18`) |
| Salas de amigos / plano em grupo | `app/(private)/salas`, `FriendsRoom*` | Sólida | — |
| Notificações in-app + Web Push | `app/(private)/notificacoes`, `server/notificationWorker.mts`, `lib/notifications/*` | Sólida | Sem canal de e-mail para eventos |
| E-mail transacional | `lib/mail/verification.ts:5`, `lib/mail/recovery.ts:5` | Parcial | `service: "gmail"`, que não serve para volume comercial |
| Importação de eventos ("Eventos IA") | `app/(adminRoutes)/admin/eventos-ia`, `lib/aiEvents/*` | Sólida (só admin) | **Não usa LLM**: extrai dados estruturados de 5 domínios permitidos (`lib/aiEvents/provider.ts:8`). O evento aprovado fica no nome do admin (`lib/aiEvents/service.ts:125`) |
| Administração (usuários, papéis, suspensão, impersonação, denúncias, auditoria) | `app/(adminRoutes)/admin/*`, `app/api/admin/*` | Sólida | Mudança de papel só pelo admin (`lib/services/userAdministration.ts:72`) |
| Privacidade / LGPD | `app/(publicRoutes)/privacidade`, `lib/privacy.ts`, consentimento de métricas | Parcial | As solicitações do titular só abrem um `mailto:` e não registram nada (`PrivacyRequestForm.tsx:14,29`, com aviso honesto). Sem exportação dos dados do usuário |
| Demonstração | `app/demonstracao/page.tsx` + `lib/demoEvents.ts` | Só visual (intencional) | Dados fictícios, útil para vendas |
| Monetização (planos, destaque, ingresso) | — | Inexistente | Não há modelo de plano, pagamento ou destaque |
| App mobile (Expo) | `../events-project-mobile` (API própria, mesmo PostgreSQL) | Separado | Toda regra nova precisa ser replicada no mobile (skill `eventmap-parity`) |

## 6. Diferenciais competitivos reais (com base no código)

1. **Experiência ao vivo além do ingresso**: comunidade com filas virtuais, enquetes, programação e achados e perdidos (`lib/community/queues.ts`, `lib/community/events.ts:74-81`). Sympla e Eventim não oferecem isso.
2. **Conexões da festa com segurança**: match mútuo, bloqueio, denúncia moderada e declaração de maioridade para paquera. É um diferencial forte para vida noturna.
3. **Lista de espera automática + check-in QR rotativo**: `qrVersion` e expiração (`schema.prisma:241-256`, `attendance.ts:153`).
4. **Catálogo inicial verificado**: importação de fontes oficiais com hash e data de verificação, exibidos ao público (`app/eventos/[id]/page.tsx:35-38`). Resolve o "ovo e galinha" do marketplace em novas cidades.
5. **Privacidade como argumento de venda**: métricas só com consentimento e Google Maps opt-in. Isso vende bem para órgãos públicos e universidades.
6. **Tempo real com contrato seguro**: os sinais transacionais invalidam e o cliente busca um snapshot (`docs/architecture.md`, seção "Comunidade em tempo real").

## 7. O que falta para um comprador B2B

- **Entrada self-service de organizador** (hoje é preciso pedir a um admin, e não há tela para isso).
- **Edição sem tirar o evento do ar.**
- **Operação em equipe**: check-in por staff; no futuro, organização com vários membros.
- **Dados exportáveis**: lista de participantes, check-ins e métricas em CSV.
- **Relatório de resultado**: funil visualização → confirmação → entrada, avaliação média e seguidores ganhos.
- **Canal direto com o público** (comunicado que notifica).
- **Marca e distribuição**: página do promotor com SEO, feed ou widget para o site do venue.
- **E-mail transacional confiável.**
- **Monetização**: planos, destaque pago e, no futuro, ingresso nativo (exige schema e credenciais).

## 8. Roadmap priorizado

### Agora (este ciclo, sem mudar o schema)
1. **P0** Edição de evento publicado sem tirar do ar (OPP-01)
2. **P0** Entrada self-service de organizador + "reivindicar evento importado" (OPP-02)
3. **P0** E-mail transacional por SMTP configurável (OPP-03)
4. **P1** Resultados 2.0: funil, avaliação, período, aviso de consentimento (OPP-04)
5. **P1** Exportação CSV de participantes e métricas, com aviso LGPD (OPP-05)
6. **P1** Check-in delegado à equipe do evento + busca e entrada manual (OPP-06)
7. **P1** Comunicado que notifica os confirmados (OPP-07)
8. **P1** Página do promotor vendável: SEO, OG, próximos e passados (OPP-08)

### Próximo
9. **P1** Feed ICS/JSON público por promotor + widget para incorporar (OPP-09)
10. **P1** Importação de eventos aberta aos promotores (OPP-10)

### Futuro (exige schema e/ou credenciais)
11. **P2** Organização / workspace com membros e papéis (OPP-11)
12. **P2** Monetização: planos, destaque pago, ingresso nativo (OPP-12)

## 9. Oportunidades detalhadas

### OPP-01 — P0 — Editar evento publicado não pode tirar o evento do ar
- **Problema:** `lib/services/events.ts:55` faz `status = submit || existing?.status === "PUBLISHED" ? "PENDING" : "DRAFT"`. A página pública só aceita PUBLISHED/CANCELLED/ENDED (`lib/eventQueries.ts:21`), então o link compartilhado passa a dar 404. As inscrições fecham (`lib/services/attendance.ts:34`), e o check-in no dia do evento fica arriscado se o organizador corrigir um erro de digitação.
- **Solução sem schema:** separar os campos sensíveis (nome, datas, horários, endereço, coordenadas, link de compra, preço) dos demais. Alterações só em campos não sensíveis (descrição, acessibilidade, classificação, condições, galeria) mantêm PUBLISHED e registram `UPDATED` no `EventHistory`, com aviso ao admin. Alterações sensíveis continuam indo para PENDING, mas com confirmação explícita na interface ("o evento sairá do ar até a revisão"). Versão "promotor confiável": quem tem N eventos validados no `EventHistory` (ação VALIDATED) fica isento da revisão.
- **Arquivos:** `lib/services/events.ts`, `components/MyComponents/EventoForm.tsx`, `app/(private)/eventos/[id]/editar/page.tsx`, `lib/eventScheduleChanges.ts`.
- **Com schema (futuro):** tabela de revisão pendente, para que a versão antiga continue no ar enquanto a nova aguarda aprovação.

### OPP-02 — P0 — Entrada self-service de organizador e "reivindicar evento"
- **Problema:** um BASIC só vira PROMOTER quando o admin troca o papel (`lib/services/userAdministration.ts:72`; `roles.ts:4` não dá a BASIC acesso a `/CriarEvento`). Não existe tela de solicitação; o cartão de perfil público só aparece para quem já é PROMOTER (`app/(private)/Profile/page.tsx:236`). Os eventos importados ficam no nome do admin (`lib/aiEvents/service.ts:125`) e o organizador real não tem como assumir o evento.
- **Solução sem schema:** card "Quero publicar eventos" no Perfil e na home logada. Ele chama uma server action que cria uma `Notification` tipo ADMIN para todos os admins (`lib/notifications/create.ts`), com link para `/admin?q=<email>`. O admin aprova com o seletor de papel já existente, e o usuário recebe uma notificação. Nos eventos importados, um CTA "Sou o organizador" gera a mesma notificação com o id do evento; a transferência de `userId` é feita por uma action de admin. Para evitar spam, aplicar um rate limit simples consultando notificações recentes.
- **Arquivos:** `app/(private)/Profile/page.tsx`, nova action em `app/(actions)/`, `lib/services/userAdministration.ts`, `app/eventos/[id]/page.tsx`, `components/MyComponents/UserTable.tsx`.
- **Com schema:** modelo `OrganizerApplication` (status, documento, motivo).

### OPP-03 — P0 — E-mail transacional profissional
- **Problema:** `lib/mail/verification.ts:5` e `lib/mail/recovery.ts:5` usam `service: "gmail"`. O Gmail tem limite diário baixo e cai como spam no domínio do cliente, o que não é aceitável em contrato B2B. Confirmação de cadastro e recuperação de senha dependem disso.
- **Solução:** transporte Nodemailer configurável (`SMTP_HOST/PORT/SECURE`, mantendo o Gmail como fallback), remetente com domínio próprio e template com a marca. Sem schema. Requer credenciais de um provedor SMTP (Resend, SES, Postmark).
- **Arquivos:** `lib/mail/verification.ts`, `lib/mail/recovery.ts`, `docs/deploy-email.md`.

### OPP-04 — P1 — Resultados 2.0 (relatório que vende)
- **Problema:** `getPromoterStats` (`lib/services/promoters.ts:63-68`) devolve só views, cliques e favoritos. Inscrições, check-ins, lista de espera, seguidores e avaliação média (`CommunityFeedback`, hoje visível apenas na comunidade, `lib/community/events.ts:45`) ficam de fora. Não há filtro de período. A medição só ocorre com consentimento (`app/api/event-engagement/[id]/route.ts:7`), mas a página não avisa que os números são parciais.
- **Solução sem schema:** agregar `EventRegistration` por status, `checkedInAt`, `Follow` (total e ganho por período), `CommunityFeedback` (média e contagem) e `EventMetric` (30/90 dias). Mostrar o funil "visualizações → confirmações → entradas" e a taxa de comparecimento, com aviso de consentimento. Opcional: adicionar UTM `utm_source=eventmap` ao `linkParaCompra` no clique (`EventPublicActions.tsx:119`), para o organizador medir as vendas na própria bilheteria.
- **Arquivos:** `lib/services/promoters.ts`, `app/(private)/resultados/page.tsx`, `app/(actions)/engagement/action.ts`.

### OPP-05 — P1 — Exportação CSV (participantes e métricas)
- **Problema:** não há nenhuma exportação no projeto (uma busca por `text/csv` não encontra nada). A lista de check-in tem nome e e-mail (`checkin/page.tsx`), mas só aparece na tela. Além disso, o texto de inscrição não informa que o organizador verá nome e e-mail (`EventPublicActions.tsx:104`).
- **Solução sem schema:** `GET /api/events/[id]/check-in?format=csv`, reutilizando `getCheckInRoster` (`lib/services/attendance.ts:186-189`, que já checa dono ou admin), com `Cache-Control: no-store` e escape contra CSV injection. Fazer o mesmo para métricas diárias. Atualizar o aviso de inscrição e a página `/privacidade` sobre o compartilhamento com o organizador.
- **Arquivos:** `app/api/events/[id]/check-in/route.ts`, `lib/services/attendance.ts`, `app/(private)/myEvents/[id]/checkin/page.tsx`, `components/MyComponents/EventPublicActions.tsx`, `app/(publicRoutes)/privacidade/page.tsx`.

### OPP-06 — P1 — Check-in pela equipe do evento + busca e entrada manual
- **Problema:** `getCheckInRoster` e `checkInAttendee` aceitam apenas o dono ou um ADMIN (`lib/services/attendance.ts:189,199`), e a rota exige PROMOTER/ADMIN (`lib/authPolicy.ts:25`). Na porta, o promotor precisa emprestar o próprio login. Também não há busca por nome nem confirmação manual para quem está sem celular.
- **Solução sem schema:** reutilizar `CommunityTeamMember` (já gerido pelo dono em `lib/community/events.ts:74-75`) como permissão de check-in. Liberar a rota de check-in para membros da equipe (inclusive BASIC) com checagem no serviço, adicionar busca local e um botão "Registrar entrada" por inscrição (ação por `registrationId`, com auditoria em `EventHistory.note`).
- **Arquivos:** `lib/services/attendance.ts`, `lib/authPolicy.ts`, `middleware.ts`, `app/(private)/myEvents/[id]/checkin/page.tsx`, `app/api/events/[id]/check-in/route.ts`. Paridade mobile obrigatória.

### OPP-07 — P1 — Comunicado que chega ao público
- **Problema:** `handleAnnouncement` só cria a entrada (`lib/community/announcements.ts:8`). Ninguém é notificado, então mudança de portão, atraso ou chuva não chegam a quem confirmou presença.
- **Solução sem schema:** ao publicar, notificar os inscritos CONFIRMED/CHECKED_IN (e, opcionalmente, quem favoritou) com `createNotification` tipo `EVENT_CHANGE` na mesma transação. O worker de push existente faz a entrega (`server/notificationWorker.mts`). Limitar a frequência, por exemplo a 3 comunicados por hora.
- **Arquivos:** `lib/community/announcements.ts`, `lib/community/notifications.ts`, `schemas/community.ts`, `components/MyComponents/CommunityEventSections.tsx`.

### OPP-08 — P1 — Página do promotor como vitrine vendável
- **Problema:** `app/promotores/[id]/page.tsx` não tem `generateMetadata` (título genérico e sem OG ao compartilhar no WhatsApp) nem JSON-LD `Organization`, e mistura eventos futuros e passados (`lib/services/promoters.ts:5` ordena só por `dataInicio desc`). Há também uma inconsistência de limite: a bio aceita 600 caracteres na interface (`Profile/page.tsx:236`) e 1000 no serviço (`lib/services/promoters.ts`, `updatePromoterProfile`).
- **Solução sem schema:** metadata/OG com avatar e bio, JSON-LD, seções "Próximos" e "Realizados", contadores (eventos realizados, seguidores, avaliação média) e botão de compartilhar. Uma marca visual própria (capa, cor) exigiria schema.
- **Arquivos:** `app/promotores/[id]/page.tsx`, `lib/services/promoters.ts`, `app/(private)/Profile/page.tsx`.

### OPP-09 — P1 — Feed público e widget incorporável (venues, turismo)
- **Problema:** já existe ICS por evento e para a agenda pessoal (`app/api/event-calendar/[id]/route.ts:14`, `app/api/my-calendar/route.ts:12`, `lib/eventCalendar.ts`), mas não há feed por organizador nem forma de mostrar a agenda no site do venue ou da prefeitura.
- **Solução sem schema:** `GET /api/promotores/[id]/agenda.ics` e `.json` (eventos PUBLISHED, projeção pública `publicEventSelect`) e uma página leve `/incorporar/promotores/[id]`, sem mapa, para iframe com link de volta (gera aquisição).
- **Arquivos:** novos handlers em `app/api/`, `lib/eventCalendar.ts`, `lib/eventQueries.ts`, `next.config` (permitir frame só nessa rota).

### OPP-10 — P1 — Importação de eventos para promotores
- **Problema:** a importação verificada (`lib/aiEvents/provider.ts:8`, domínios Sympla, Eventim, SESC, Ingresse e Ticket360) é só para admin (`app/api/admin/ai-events`). Para o promotor que já vende no Sympla, recadastrar o evento é atrito. O nome "Eventos IA" também é impreciso, já que não há modelo de linguagem envolvido.
- **Solução sem schema:** em `/CriarEvento`, um campo "Importar de um link oficial" que reutiliza `canonicalSourceUrl` e a extração existente para **pré-preencher o formulário** (sem criar candidato), mantendo a moderação normal. Renomear na interface para "Importação verificada".
- **Arquivos:** `lib/aiEvents/provider.ts`, nova action em `app/(actions)/eventos/`, `components/MyComponents/EventoForm.tsx`, `components/MyComponents/AdminAiEvents.tsx`.

### OPP-11 — P2 — Organização / workspace multiusuário
- **Problema:** `Events.userId` é o único dono (`schema.prisma:117-118`). Não existe entidade de organização, venue ou membros com papéis (editor, financeiro, porta).
- **Solução:** modelos `Organization`, `OrganizationMember(role)` e `Events.organizationId`, com migração aditiva e paridade SQL no mobile. Versão parcial sem schema: OPP-06 (equipe por evento) + OPP-02.
- **Arquivos:** `prisma/schema.prisma`, `lib/services/events.ts`, `lib/services/attendance.ts`, `lib/services/promoters.ts`, `events-project-mobile/server/independent/migrations/`.

### OPP-12 — P2 — Monetização (planos, destaque pago, ingresso nativo)
- **Problema:** não há plano, cobrança, destaque nem venda de ingresso. O produto não tem receita própria e depende de link externo (`EventPublicActions.tsx:119`).
- **Solução:** fase 1 sem schema, com planos vendidos manualmente e limites aplicados por configuração (ex.: exportação e resultados avançados só para contas na allowlist). Fase 2 com modelos `Plan/Subscription` e `FeaturedPlacement` e um gateway (Mercado Pago/Stripe). Fase 3 com ingresso nativo ligado ao `EventRegistration`.
- **Arquivos:** `prisma/schema.prisma`, `lib/services/*`, `app/(private)/resultados`, nova área `/planos`.

## 10. Itens não conectados ou só visuais (para transparência comercial)

- Os comunicados da comunidade não notificam ninguém: `lib/community/announcements.ts:8`.
- O formulário de solicitação LGPD só abre o `mailto:` e não registra o pedido: `components/MyComponents/PrivacyRequestForm.tsx:14,29` (a interface avisa).
- `/resultados` mostra números que dependem de consentimento sem dizer isso ao organizador: `app/api/event-engagement/[id]/route.ts:7` x `app/(private)/resultados/page.tsx:28-29`.
- A avaliação pós-evento existe, mas não entra no relatório do organizador: `lib/community/events.ts:45-46` x `lib/services/promoters.ts:63-68`.
- "Eventos IA" não usa IA (é extração de dados estruturados): `lib/aiEvents/provider.ts:8,89`.
- `/demonstracao` usa dados fictícios (`lib/demoEvents.ts`). É intencional, mas não deve ser apresentada como uso real.
- O limite da bio do promotor diverge entre a interface (600) e o serviço (1000): `app/(private)/Profile/page.tsx:236` x `lib/services/promoters.ts`.

## 11. Riscos e dependências

- **Paridade mobile:** OPP-01, 06 e 07 mudam regras de negócio. A API mobile (`events-project-mobile/server/`) não importa código do site e precisa ser atualizada junto.
- **Banco possivelmente de produção:** nada aqui exige migração no ciclo atual. OPP-11 e OPP-12 ficam para um ciclo com migração aprovada.
- **Escala do tempo real:** a entrega pressupõe um único servidor Socket.IO (`docs/architecture.md`). Isso limita contratos maiores (prefeituras, festivais) até existir um adapter pub/sub.
- **LGPD:** a exportação (OPP-05) só pode ir ao ar junto com a atualização do aviso de inscrição e da política de privacidade.
