# 05 — Inovação de produto e IA

Especialista: inovação de produto e IA. Fase: auditoria somente leitura (branch `codex/produto-comercial-20261118`, base `1f536cd`).
Escopo: entender a "IA" existente e propor funcionalidades comercialmente fortes, viáveis **sem alterar o schema Prisma** neste ciclo, sem dados fictícios e sem integrações inventadas.

---

## 1. O que o EventMap é hoje (resumo funcional)

Plataforma de descoberta e gestão de eventos com mapa. Para o **público**: busca/mapa, salvar (Favorite) com lembrete, inscrição gratuita com QR (EventRegistration), agenda pessoal com exportação .ics, recomendações, comunidade do evento, chat, conexões da festa e salas de amigos. Para o **organizador (PROMOTER)**: criação com rascunho/revisão, recorrência, check-in por QR, página pública de promotor com seguidores e uma tela de "Resultados". Para o **ADMIN**: moderação, usuários, denúncias, auditoria e "Importar eventos".

Funcionalidades que **já existem** e não devem ser propostas como novidade:

| Recurso | Evidência |
|---|---|
| .ics de um evento (público) | `app/api/event-calendar/[id]/route.ts:6-15`; `curl GET /api/event-calendar/<id>` → `200 text/calendar` |
| .ics da agenda salva (download autenticado) | `app/api/my-calendar/route.ts:7-13`; botão em `components/MyComponents/PersonalAgenda.tsx:29`; `curl` sem sessão → `401` |
| Recomendações por categoria/proximidade/seguidos | `lib/services/recommendations.ts:5-21`, `lib/eventRecommendations.ts:12-24`, exibidas só em `/salvos` via `PersonalAgenda.tsx:37` |
| Métricas de visualização e clique em ingresso | escrita em `app/api/event-engagement/[id]/route.ts:5-28` (Events.views/ticketClicks + EventMetric diário) |
| Tela "Resultados" (views, cliques, favoritos, barra de 30 dias) | `app/(private)/resultados/page.tsx:28-33`, dados em `lib/services/promoters.ts:63-70` |
| Lista de inscritos e check-in por QR | `app/(private)/myEvents/[id]/checkin/page.tsx`, `lib/services/attendance.ts:186-210` |
| Roteiro (template) para descrição | `components/MyComponents/EventoForm.tsx:257-266` ("Usar roteiro para a descrição") |
| Lembrete de favoritos e encerramento automático | `server/notificationWorker.mts:35-70` |
| Colaboração (salas de amigos, sugestões e votos, convite de plano) | modelos `FriendsRoom`, `FriendsSuggestion`, `FriendsVote` (`prisma/schema.prisma:480-520`), `components/MyComponents/PlanInvite.tsx` |

---

## 2. Diagnóstico da "IA" existente (`lib/aiEvents/`, `/admin/eventos-ia`)

**Conclusão: não há IA/LLM no projeto.** O módulo chamado "aiEvents" é um **importador determinístico de eventos a partir de dados estruturados (JSON-LD schema.org e `__NEXT_DATA__` do Sympla)**. É bem construído e honesto na interface, mas o nome no código e algumas mensagens sugerem IA.

Evidências:

- **Nenhum provedor de IA**: busca por `openai|anthropic|gemini|generativeai` em `.ts/.tsx/.mts/.json` não retorna nada (fora do lockfile). `.env.example` não tem nenhuma variável de IA (só Maps, Blob, banco, NextAuth, Socket, e-mail, Web Push e `CHECKIN_SIGNING_SECRET`).
- `lib/aiEvents/provider.ts:271-272`: `aiConfigured: () => true` com o comentário "Public catalogs require no credentials". Ou seja, não há chamada a modelo.
- `provider.ts:162`: "Facts come from the publisher's Event JSON-LD, not from model-generated prose." A descrição gerada é uma frase fixa (`provider.ts:201`).
- Fontes permitidas: `sympla.com.br`, `eventim.com.br`, `sescsp.org.br`, `ingresse.com`, `ticket360.com.br` (`provider.ts:8`). A descoberta automática só funciona no catálogo do Sympla (`catalog.ts:13-16`, `provider.ts:212`) para 12 cidades (`catalog.ts:1-6`).
- Segurança boa: HTTPS obrigatório, allowlist de domínio, bloqueio de IP privado/SSRF com DNS fixado (`provider.ts:53-117`), limite de 2 MB e 15 s, rejeição de eventos online/cancelados (`provider.ts:168`).
- Fluxo: fila `AiEventRun` → worker a cada 30 s (`server/aiEventsWorker.mts:13`, iniciado em `server.mts:92`) → `AiEventCandidate` PENDING → aprovação individual do admin, que **relê a fonte** e compara hash antes de publicar (`lib/aiEvents/service.ts:124-149`). Nunca publica sozinho (`service.ts:151`).
- Interface honesta: menu "Importar eventos" (`components/ui/app-sidebar.tsx:50`), textos "Busque eventos em fontes públicas e revise as propostas" (`AdminAiEvents.tsx`). Porém a resposta de erro diz "A área de IA ainda não está disponível" (`app/api/admin/ai-events/route.ts:15`) e todo o domínio (tabelas `AiEvent*`, rota `ai-events`, `eventos-ia`) usa "IA".
- `curl GET /admin/eventos-ia` → `307` para login; `GET /api/admin/ai-events` sem sessão → `403` (proteção funcionando).

Riscos comerciais do importador:

1. **Dependência do worker no servidor customizado**: só roda via `server.mts` (`server.mts:92`). Em `next start` puro (ex.: Vercel) a fila fica eternamente em `QUEUED`.
2. **Termos de uso de terceiros**: varrer o catálogo do Sympla (`provider.ts:273-304`) para republicar eventos de terceiros pode violar termos de uso do site. Para venda, isso precisa de validação jurídica ou de um caminho "o próprio organizador importa o seu evento" (ver O-07).
3. **Imagens externas**: o banner importado é a URL do publicador (`provider.ts:194-195`), servida direto do domínio externo (hotlink). A CSP (hoje só `Report-Only`, `next.config.mjs:55-57`) não inclui esses domínios em `img-src` (`next.config.mjs:23`); se for aplicada de verdade, os banners importados quebram.
4. **Nome enganoso**: vender "IA" que não existe é um risco de credibilidade. Recomenda-se descrever como "importação verificada de fontes oficiais" no material comercial e trocar a mensagem de `route.ts:15`.

---

## 3. Recursos "visuais/não conectados" ou parciais encontrados

- **Mudança/cancelamento não avisa quem se inscreveu.** `notifyEventAudience` só avisa dono, favoritos, seguidores e admins (`lib/eventNotifications.ts:5-23`), nunca `EventRegistration`. Cancelamento: `lib/services/events.ts:135`; alteração: `events.ts:74-75`. Quem confirmou presença sem salvar o evento não fica sabendo. A inscrição continua `CONFIRMED` mesmo com o evento `CANCELLED` (`events.ts:133`).
- **Inscritos não recebem lembrete.** O worker só lembra quem favoritou e escolheu `reminderMinutes` (`server/notificationWorker.mts:41-48`).
- **"Resultados" não mostra inscrições nem check-ins**, embora os dados existam (`lib/services/promoters.ts:67` só seleciona views, ticketClicks, favorites e metrics). O funil de quem foi ao evento, que é o dado mais valioso para o organizador, não aparece.
- **Métricas dependem de consentimento**: sem o cookie `METRIC_CONSENT_COOKIE=yes` nada é contado (`app/api/event-engagement/[id]/route.ts:8`). Isso está correto pela LGPD, mas a tela de Resultados não avisa que os números são parciais.
- **Lista de inscritos mostra o e-mail ao organizador** (`checkin/page.tsx:144`; `attendance.ts:192`), mas o texto da inscrição não informa isso (`components/MyComponents/EventPublicActions.tsx:104`). A política de privacidade fala apenas em "inscrições" de modo genérico (`app/(publicRoutes)/privacidade/page.tsx:33`).
- **Descrição limitada a 3000 caracteres no formulário** (`EventoForm.tsx:260`), embora o schema aceite 10000 (`schemas/eventInput.ts:9`). É uma inconsistência pequena.
- Recomendações aparecem apenas em `/salvos`. A home e a página do evento não têm "eventos parecidos".

---

## 4. Oportunidades priorizadas (máx. 12)

Legenda: **Schema** = exige mudança no Prisma; **Cred.** = exige chave paga ou credencial ausente; **Sem schema?** = existe versão viável sem migração.

### O-01 · P0 · Avisar e lembrar inscritos (EventRegistration) — Schema: não · Cred.: não · Sem schema: sim · S/M
- **Problema**: quem se inscreveu não recebe aviso de cancelamento ou mudança e não recebe lembrete. Detalhes na seção 3.
- **Dados existentes**: `EventRegistration.status/userId/eventId` (`schema.prisma:241-261`); `Notification.groupKey` (`schema.prisma:347`), já aceito por `createNotification` (`lib/notifications/create.ts:9`).
- **Solução mínima real**:
  1. Em `lib/eventNotifications.ts`, adicionar a opção `includeRegistrations` (padrão `true` quando o status é público). A consulta busca `tx.eventRegistration.findMany({ where: { eventId, status: { in: ["CONFIRMED","WAITLISTED"] } }, select: { userId: true } })`, e os destinatários entram no mesmo `Map`, o que já elimina duplicatas.
  2. Em `cancelarEvento` (`lib/services/events.ts:126-137`), decidir se as inscrições passam para `CANCELLED`. Essa é uma decisão de produto; o mínimo é avisar os inscritos.
  3. Em `server/notificationWorker.mts`, adicionar um lembrete "seu evento começa em 24 h / 2 h" para inscrições `CONFIRMED`. A deduplicação usa `groupKey = "reg-reminder:<registrationId>:24h"`, conferido com `notification.count` antes de criar. Isso evita um campo novo `reminderSentAt` na inscrição.
- **Arquivos**: `lib/eventNotifications.ts`, `lib/services/events.ts`, `server/notificationWorker.mts`. Validar com `npx tsc --project tsconfig.server.json`. Paridade: o servidor independente do app mobile (`events-project-mobile/server/independent/src/`) tem os próprios serviços. Conferir com o skill `eventmap-parity`.
- **Impacto comercial**: confiabilidade básica. Um evento cancelado sem aviso aos inscritos destrói a confiança do público e do organizador.

### O-02 · P1 · Funil do organizador em "Resultados" — Schema: não · Cred.: não · Sem schema: sim · M
- **Problema**: a tela mostra só views, cliques e favoritos (`lib/services/promoters.ts:67-69`). Faltam inscrições, lista de espera, check-ins, taxa de comparecimento, ocupação da capacidade e avaliação.
- **Dados existentes**: `EventMetric(day, views, ticketClicks)` (`schema.prisma:375-383`); `Favorite.createdAt` (`:320-331`); `EventRegistration.status/createdAt/checkedInAt` (`:241-261`); `Events.capacity` (`:141`); `CommunityFeedback.rating` (`:469-478`, já agregado em `lib/community/events.ts:45`).
- **Solução mínima real**: estender `getPromoterStats` com `eventRegistration.groupBy({ by: ["eventId","status"], where: { event: { userId } }, _count: true })` e `communityFeedback.groupBy({ by:["eventId"], _avg:{rating:true}, _count:true })`. Também incluir favoritos por dia (`favorite.findMany` com `createdAt >= 30 dias`, agregado em memória). Na UI, montar o funil Visualizações → Cliques no ingresso → Favoritos → Inscrições → Check-ins, com as taxas, a ocupação `confirmados/capacity` e um aviso fixo: "Visualizações e cliques contam apenas visitantes que aceitaram métricas". Esse aviso não deve trazer estimativa ou extrapolação.
- **Arquivos**: `lib/services/promoters.ts`, `app/(actions)/engagement/action.ts`, `app/(private)/resultados/page.tsx`. Carregar o skill `dataviz` para o gráfico e delegar o visual ao subagente de front-end (`.codex/frontend-agent.md`).
- **Impacto comercial**: é o principal argumento para cobrar do organizador ("veja quem realmente foi").

### O-03 · P0 · Transparência LGPD sobre dados de inscritos visíveis ao organizador — Schema: não · Cred.: não · Sem schema: sim · S
- **Problema**: o organizador vê nome e e-mail de cada inscrito (`attendance.ts:192`, `checkin/page.tsx:144`), mas o participante não é informado no momento da inscrição (`EventPublicActions.tsx:104`).
- **Solução**: incluir no bloco de inscrição a frase "Ao confirmar, seu nome e e-mail ficam visíveis para a organização deste evento para controle de entrada". Detalhar o compartilhamento com o organizador em `app/(publicRoutes)/privacidade/page.tsx`. É pré-requisito do O-04.
- **Arquivos**: `components/MyComponents/EventPublicActions.tsx`, `app/(publicRoutes)/privacidade/page.tsx`.
- **Impacto comercial**: reduz o risco jurídico e é requisito para vender a empresas.

### O-04 · P1 · Exportar inscritos em CSV — Schema: não · Cred.: não · Sem schema: sim · S
- **Dados existentes**: `getCheckInRoster` já autoriza (dono ou ADMIN) e devolve status, createdAt, checkedInAt, nome e e-mail (`lib/services/attendance.ts:186-194`).
- **Solução**: criar `app/api/events/[id]/registrations/route.ts` (GET) que reaproveita `getCheckInRoster` e responde `text/csv; charset=utf-8` com BOM (abre direto no Excel pt-BR), separador `;`, `Content-Disposition: attachment` e `Cache-Control: private, no-store`. Células que começam com `= + - @ \t \r` recebem o prefixo `'` para evitar injeção de fórmula. Adicionar o botão "Exportar CSV" em `checkin/page.tsx`. Não registrar e-mails em log.
- **Dependência**: O-03.
- **Impacto comercial**: é um recurso padrão de mercado (Sympla e Even3 oferecem) e o organizador pede logo no primeiro dia.

### O-05 · P1 · Widgets incorporáveis (agenda do promotor e cartão do evento) — Schema: não · Cred.: não · Sem schema: sim · M
- **Problema**: hoje é impossível incorporar o EventMap em outro site. `X-Frame-Options: DENY` e `frame-ancestors 'none'` valem para todas as rotas (`next.config.mjs:29`, `:47-53`); o `curl -I /` confirma `X-Frame-Options: DENY`.
- **Solução mínima real**: criar as rotas `app/embed/promotores/[id]/page.tsx` e `app/embed/eventos/[id]/page.tsx`, com layout mínimo, sem sessão, chat ou mapa, só dados públicos (`getPublicEvent`, `getPromoterProfile` com `publicEventSelect`) e links `target="_blank"` para o EventMap. Em `next.config.mjs`, aplicar a regra global a todas as rotas exceto `/embed/:path*`, que recebe `frame-ancestors *` sem `X-Frame-Options`. A página do promotor ganha o botão "Copiar código de incorporação", com um `<iframe>` pronto.
- **Arquivos**: `next.config.mjs`, `app/embed/**`, `app/promotores/[id]/page.tsx`.
- **Impacto comercial**: cada widget instalado gera tráfego e reconhecimento da marca e é um diferencial para casas de show e coletivos.

### O-06 · P1 · Assistente de descrição (determinístico agora, LLM opcional depois) — Schema: não · Cred.: sim para LLM · Sem schema: sim · M
- **Situação atual**: só existe um roteiro estático (`EventoForm.tsx:262-264`) e um checklist de três itens (`EventoForm.tsx:105-109`). Não há nenhuma chave de LLM (seção 2).
- **Versão sem credencial (real, já entregável)**: criar `lib/eventDescriptionAssistant.ts`, com funções puras que:
  1. montam um rascunho a partir dos campos que o organizador **já preencheu** (nome, categoria, data e horário, endereço, gratuito ou preço, classificação etária, acessibilidade, condições), sem inventar atrações;
  2. avaliam a qualidade do texto: tamanho, presença de horário, de "como chegar", de acessibilidade e de público-alvo, e a ausência de URLs encurtadas;
  3. mostram sugestões objetivas ("Falta informar acessibilidade").
  O formulário ganha o botão "Gerar rascunho com meus dados" e um painel de dicas. Aproveitar para alinhar o `maxLength` 3000 do formulário com o limite de 10000 do schema.
- **Versão LLM (futura)**: rota `app/api/event-assistant/route.ts`, ativa só com a variável `EVENT_ASSISTANT_API_KEY` presente (hoje ausente). O texto do modelo é sempre uma **sugestão editável**, nunca é publicado sem revisão, e a rota precisa de limite por usuário. Se a variável faltar, o botão some e a versão determinística continua funcionando.
- **Arquivos**: `components/MyComponents/EventoForm.tsx`, `lib/eventDescriptionAssistant.ts` (novo), e futuramente `app/api/event-assistant/route.ts`.
- **Impacto comercial**: eventos com descrição melhor recebem mais cliques, e a versão LLM pode virar recurso pago.

### O-07 · P1 · Importação self-service: organizador importa o próprio evento de um link oficial para rascunho — Schema: não · Cred.: não · Sem schema: sim · M
- **Base existente**: `inspectEventSource(url)` já extrai nome, datas, horário, fuso, endereço, geo, preço, categoria e banner com proteção contra SSRF (`lib/aiEvents/provider.ts:264-269`). Hoje só o ADMIN usa (`service.ts:40-44`).
- **Solução**: criar a rota `app/api/events/import-preview/route.ts` (POST para PROMOTER/ADMIN autenticado, com checagem de origem como em `lib/community/http.ts`). Ela chama `inspectEventSource` e **só devolve** os campos para pré-preencher o `EventoForm`, sem gravar nada. O organizador revisa e envia pelo fluxo normal (DRAFT/PENDING com moderação). O limite de uso fica em memória por usuário, sem tabela nova. O banner externo é baixado e reenviado pelo `/api/upload` existente, o que resolve o hotlink e a CSP.
- **Arquivos**: `lib/aiEvents/provider.ts` (reuso), `app/api/events/import-preview/route.ts` (novo), `components/MyComponents/EventoForm.tsx`.
- **Impacto comercial**: o organizador sai de "tenho evento no Sympla" para "estou no EventMap" em 30 segundos, e o risco de termos de uso diminui porque quem importa é o próprio dono do conteúdo.

### O-08 · P1 · Recomendações mais inteligentes e em mais lugares — Schema: não · Cred.: não · Sem schema: sim · M
- **Situação atual**: os sinais são só favoritos e seguidos (`lib/services/recommendations.ts:8-12`), com pontuação fixa 5/3/2 (`lib/eventRecommendations.ts:20`), e aparecem só em `/salvos`.
- **Solução**:
  1. Somar `EventRegistration` (`CONFIRMED` e `CHECKED_IN`) aos sinais de preferência, porque é um sinal mais forte que o favorito.
  2. Criar o bloco "Quem salvou este evento também salvou", com co-ocorrência em `Favorite` (eventos com usuários em comum, limitados a eventos futuros publicados). Exibir só quando houver pelo menos N usuários em comum, para não expor ninguém.
  3. Mostrar "Eventos parecidos" (mesma categoria e até 50 km, reaproveitando `nearby`) em `app/eventos/[id]/page.tsx`, sem login.
  Cada cartão mantém o "motivo" explícito, como já é feito hoje.
- **Arquivos**: `lib/services/recommendations.ts`, `lib/eventRecommendations.ts`, `components/MyComponents/EventRecommendations.tsx`, `app/eventos/[id]/page.tsx`.
- **Impacto comercial**: mais eventos vistos por sessão e mais retorno ao app. O bloco também é um espaço natural para destaque pago no futuro.

### O-09 · P2 · Relatório pós-evento automático para o organizador — Schema: não · Cred.: não (sim para resumo por LLM) · Sem schema: sim · S/M
- **Dados**: quando o worker muda o status para `ENDED` (`server/notificationWorker.mts:63-64`), já é possível calcular inscritos, check-ins, faltas, nota média e número de avaliações (`CommunityFeedback`), além do total de views e cliques.
- **Solução**: criar uma notificação "Seu relatório está pronto" com link para `/resultados?evento=<id>`, mostrando um resumo calculado sob demanda, sem guardar nada novo. Os comentários de feedback aparecem literais. Um resumo dos comentários por LLM fica para depois e depende de credencial.
- **Arquivos**: `server/notificationWorker.mts`, `lib/services/promoters.ts`, `app/(private)/resultados/page.tsx`.

### O-10 · P2 · Notificações inteligentes ("novos eventos do seu interesse", "últimas vagas") — Schema: sim para preferências completas · Cred.: não · Sem schema: sim (limitada) · M
- **Dados**: categorias e localização dos favoritos (como em `recommendations.ts`), `Events.capacity` e contagem de inscrições (`attendance.ts:85-87`).
- **Versão sem schema**: um resumo semanal (máximo de um por usuário por semana) com até 3 eventos novos recomendados, e o aviso "restam poucas vagas" para quem favoritou um evento com ocupação acima de 90%. A deduplicação usa `Notification.groupKey` (`digest:<isoWeek>`, `capacity:<eventId>`). A entrega fica restrita à central e ao push já ativado pelo usuário.
- **Limitação**: não existe tabela de preferências de notificação no schema, então não dá para oferecer opt-out por tipo. Por isso a prioridade é P2: sem opt-out, o risco de parecer spam é alto.
- **Arquivos**: `server/notificationWorker.mts`, `lib/notifications/catalog.ts`.

### O-11 · P2 · Agenda assinável (webcal) e botão "Google Agenda" — Schema: não · Cred.: não · Sem schema: sim · S
- **Situação atual**: o .ics é um download que o próprio produto diz que precisa ser refeito a cada mudança (`PersonalAgenda.tsx:31`).
- **Solução**: criar `GET /api/my-calendar/feed?t=<token>`, com token HMAC (`userId` + `sessionVersion`) assinado com um segredo de servidor já existente. Trocar a senha incrementa `sessionVersion` (`schema.prisma:21`), o que revoga o link sem precisar de tabela nova. Na página do evento, adicionar um link `calendar.google.com/calendar/render?action=TEMPLATE...`, que não exige credencial.
- **Arquivos**: `app/api/my-calendar/feed/route.ts` (novo), `lib/eventCalendar.ts`, `components/MyComponents/PersonalAgenda.tsx`, `components/MyComponents/EventPublicActions.tsx`.

### O-12 · P2 · Transparência do importador ("IA" → "importação verificada") — Schema: não (renomear tabelas exigiria) · Cred.: não · Sem schema: sim · S
- **Solução**: manter tabelas e rotas publicadas, conforme o AGENTS.md pede, e mudar só o texto: `app/api/admin/ai-events/route.ts:15` passa a dizer "A importação de eventos ainda não está disponível". O material comercial deve descrever o recurso como importação de fontes oficiais. Documentar que o worker exige `server.mts` e registrar o risco de termos de uso do Sympla. Avaliar se a descoberta automática no catálogo (`provider.ts:273-304`) fica desligada por padrão em produção comercial e se o O-07 (importação pelo próprio organizador) vira o caminho principal.

---

## 5. Observações para quem implementar

- Todas as propostas P0/P1 rodam com o schema atual. Os únicos itens que dependem de credenciais externas são as variantes de LLM (O-06, O-09), que precisam degradar com segurança quando a chave não existir.
- Seguir `.codex/frontend-agent.md` para O-02, O-04, O-05, O-06 e O-08, delegando a parte visual a um subagente de front-end.
- Validação: `npx tsc --noEmit --incremental false`, `npm run lint`, `npm run build`. Para mudanças no worker, também `npx tsc --project tsconfig.server.json` e `npm run test:notifications`. Não rodar scripts `:db` ou `:http` contra o banco de `.env`, que pode ser de produção.
- Paridade mobile: o app Expo tem um servidor independente com `promoter-service.ts` e `interaction-service.ts` (`events-project-mobile/server/independent/src/`). Mudanças no funil e nas notificações devem ser espelhadas ou ficar registradas como pendência.
