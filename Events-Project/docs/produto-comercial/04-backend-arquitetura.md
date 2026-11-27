# 04 — Backend e arquitetura (auditoria comercial)

Escopo: `app/api/**`, `app/(actions)/**`, `lib/**`, `middleware.ts`, `lib/authPolicy.ts`, `roles.ts`, `lib/auth/options.ts`, `server.mts`, `server/*.mts`, `prisma/schema.prisma`.
Branch auditada: `codex/produto-comercial-20261118`. Auditoria somente leitura. Nenhuma escrita no banco. Chamadas ao dev server: apenas GET sem autenticação.

## 1. Diagnóstico geral

A camada de servidor está bem acima da média de um projeto de portfólio. Toda rota mutável lida resolve a identidade com `getAuthenticatedUser`, que relê o usuário no banco a cada chamada (`lib/adminAuth.ts:10-27`) e valida suspensão, `sessionVersion`, carimbo de credencial e impersonação. Rotas sensíveis verificam a origem (`lib/publicUrl.ts:20-24`, `lib/community/http.ts:6-9`) e limitam o corpo a 16 KB (`lib/community/http.ts:16-26`). Os fluxos de capacidade, lista de espera e check-in usam transações `Serializable` com retry (`lib/services/attendance.ts:21-30`). O QR de check-in é assinado com HMAC, expira em 5 minutos e rotaciona por `qrVersion` (`lib/services/attendance.ts:153-184`). A recuperação de senha tem rate limit persistido e resposta genérica (`lib/services/passwordRecovery.ts:22-64`).

Os riscos comerciais estão em outro lugar:

1. **Operação.** Todos os jobs (lembretes, encerramento automático, push, importação de eventos) rodam dentro do servidor Socket.IO, hospedado no plano gratuito do Render, que hiberna (`server.mts:86-95`, `docs/render-keepalive.md`).
2. **Integridade de negócio.** Quem confirmou presença não é avisado quando o evento é cancelado, alterado ou excluído. Excluir um promotor apaga em cascata todos os eventos dele e as inscrições.
3. **Autenticação.** O login não tem limite de tentativas e permite enumerar contas.
4. **Escala.** O catálogo é carregado inteiro, sem paginação, e a tabela `events` não tem índices. A atualização em tempo real do catálogo depende de o cliente avisar o servidor.

## 2. AuthN/AuthZ: verificação de IDOR rota a rota

| Superfície | Verificação | Resultado |
|---|---|---|
| Editar, cancelar e duplicar evento (`lib/services/events.ts:36,102,130`) | `userId === user.id` ou ADMIN | OK |
| Solicitar correção (`lib/services/events.ts:147`) | só ADMIN | OK |
| Série recorrente (`lib/services/recurrence.ts:17-19`) | dono ou ADMIN | OK |
| Inscrição e cancelamento (`app/api/events/[id]/registration/route.ts:25-45`) | sempre `user.id` da sessão, nunca do corpo | OK |
| Roster e check-in (`lib/services/attendance.ts:186-209`) | dono do evento ou ADMIN; token amarrado a `eventId` + `qrVersion` | OK |
| Histórico (`app/(actions)/eventHistory/action.ts:54-60`) | dono, histórico do dono ou ADMIN | OK |
| `EventsUser` / `getForEventsForUserById` (`app/api/EventsUser/route.ts:17-20`) | próprio usuário ou ADMIN | OK |
| Upload de perfil (`app/api/upload/route.ts:23`) | `userId` do form precisa ser igual ao da sessão | OK |
| Imagens de chat privado (`app/api/party-connections/.../images/[imageId]/route.ts:15-26`) | `matchAccess` + mesmo evento/match | OK |
| Admin (users, reports, suspension, ai-events, events, impersonation) | `getAuthenticatedAdminId` em todas | OK |
| `validateEvents` / `deleteEvents` (`app/(actions)/validateEvents/action.ts:10-16`) | ADMIN + `adminId` igual ao autenticado | OK |
| Push (`app/api/push/subscriptions/route.ts:30`) | `deleteMany` filtrado por `userId` | OK |

**Nenhum IDOR explorável foi encontrado.** Restam problemas de *política*:

- `alterRoleUser` permite que um ADMIN promova qualquer conta a ADMIN. Depois disso, ninguém consegue rebaixá-la nem excluí-la, porque o código bloqueia alterações em ADMIN (`lib/services/userAdministration.ts:79-87`). Não há auditoria de mudança de papel nem de exclusão, ao contrário da suspensão, que grava `UserSuspensionAudit` (`lib/services/userSuspension.ts:38`).
- `app/(actions)/getAllUsers/action.ts` não tem `"use server"` e nenhum código o importa. É código morto.

## 3. Achados por tema

### 3.1 Autenticação

- **Login sem rate limit.** O `authorize` do Credentials (`lib/auth/options.ts:47-67`) e a server action pública `validateUser` (`lib/services/credentials.ts:8-73`) executam bcrypt sem limitar tentativas. O cliente chama primeiro `validateUser` e depois `signIn` (`components/login-form.tsx:55-63`), então cada tentativa custa dois bcrypt.
- **Enumeração de contas.** `validateUser` responde "verifique seu e-mail" *antes* de conferir a senha (`lib/services/credentials.ts:32-37`). Isso revela, sem senha, que a conta existe e não foi verificada. A mensagem "vinculado a outro provedor" (`:20-29`) revela contas Google. `registerUser` responde "O email já está registrado" (`lib/services/registration.ts:26-28`).
- **E-mail sem normalização.** O cadastro aplica só `trim` (`schemas/accountInput.ts:5`) e o login busca o valor exato (`lib/auth/options.ts:52-54`). A recuperação, por outro lado, ignora maiúsculas e minúsculas (`lib/services/passwordRecovery.ts:42`). Resultado: "Ana@x.com" e "ana@x.com" podem virar contas duplicadas, e o login falha conforme a caixa digitada.
- **`/api/register` sem proteção.** Não verifica origem nem tem rate limit, devolve HTTP 200 mesmo em erro (`app/api/register/route.ts:15-19`), e `req.json()` inválido lança exceção não tratada.
- **Tokens de verificação.** São gravados em texto puro e duplicam o hash da senha em `VerificationTokenEmail` (`lib/services/registration.ts:35-40`, `prisma/schema.prisma:401-408`). A recuperação, ao contrário, guarda só o hash do token (`lib/services/passwordRecovery.ts:50`).
- `jwt.maxAge: 60 * 3` (`lib/auth/options.ts:247`) dá a impressão de sessões de 3 minutos. Na prática, a rota de sessão reemite o token com `session.maxAge` de 30 dias (`node_modules/next-auth/core/routes/session.js:73-77`). É uma configuração enganosa, não um bug.

### 3.2 Integridade de dados e regras de negócio

- **Inscritos não recebem avisos.** `notifyEventAudience` notifica dono, favoritos, seguidores e admins (`lib/eventNotifications.ts:5-22`), mas **nunca as `EventRegistration`**. Cancelamento (`lib/services/events.ts:135`), mudança de data ou local (`lib/services/events.ts:75`) e exclusão pelo admin (`app/(actions)/deleteEvents/action.ts:46`) não chegam a quem confirmou presença, a menos que essa pessoa também tenha favoritado o evento. O cancelamento também mantém as inscrições como `CONFIRMED`.
- **Exclusão de usuário em cascata.** `Events.user` usa `onDelete: Cascade` (`prisma/schema.prisma:119`). `deleteUser` (`lib/services/userAdministration.ts:51-61`) apaga o promotor e, com ele, todos os eventos publicados, as inscrições, os chats e a comunidade, sem avisar ninguém e sem limpar imagens. Como `Events.userId` é anulável, dá para desvincular os eventos antes de excluir, sem mudar o schema.
- **Imagens órfãs.** `deleteEvents` remove arquivos só com `fs.unlinkSync` em `public/uploads` (`app/(actions)/deleteEvents/action.ts:56-67`). Em produção, as imagens ficam no Vercel Blob (`lib/storage/eventImages.ts:14-18`), então os blobs nunca são apagados. Já existe `removeEventImages`, que trata Blob (`lib/storage/eventImages.ts:24-33`).
- **Transações longas com timeout padrão (5 s).** `validateEvents` e `deleteEvents` percorrem eventos e notificam favoritos e seguidores dentro de uma transação interativa sem `timeout` (`app/(actions)/validateEvents/action.ts:18-61`, `app/(actions)/deleteEvents/action.ts:22-53`). Um lote grande, ou um promotor com muitos seguidores, pode estourar o tempo e reverter o lote inteiro.
- `listEventReports` pega as 200 denúncias mais recentes e só depois ordena as pendentes primeiro (`lib/services/eventReports.ts:33-44`). Denúncias pendentes mais antigas ficam invisíveis.
- **Tabela fora do schema.** `MobileEventMedia` é lida via `$queryRaw` (`app/api/profile-media/[assetId]/route.ts:12-17`, `app/api/party-profile-media/[assetId]/route.ts:37-40`), mas não está em `schema.prisma`. A migração pertence ao app mobile (`../events-project-mobile/server/independent/migrations/0001-mobile-owned-media.sql`). Um `prisma migrate dev` ou `db push` vai detectar drift e propor descartar a tabela. Isso precisa ficar documentado no guia.

### 3.3 Escalabilidade e consultas

- **Catálogo sem paginação.** `/api/AllEvents` devolve *todos* os eventos publicados com `descricao` (até 10 mil caracteres), `carrossel`, usuário e validador (`app/(actions)/getAlllEvents/action.ts:4-8`, `lib/eventQueries.ts:6-17`). Hoje são 3 eventos e 4,5 KB (GET em 18/11/2026). Com milhares, o payload passa de MB, e a home, o mapa e `EventsCreated` refazem esse fetch a cada `update-events` (`app/page.tsx:74`, `app/(publicRoutes)/EventsCreated/page.tsx:36,57`). `/api/admin/events` (`app/api/admin/events/route.ts:9-12`) e `getPromoterProfile` (`lib/services/promoters.ts:5`) também não paginam.
- **`events` sem índices.** O modelo `Events` não declara `@@index` (`prisma/schema.prisma:104-158`). Consultas por `status` + `dataInicio`, por `userId` (FK sem índice no PostgreSQL) e o worker por `dataFim` (`server/notificationWorker.mts:57`) fazem seq scan. Corrigir exige migration, fora deste ciclo.
- **Realtime do catálogo dirigido pelo cliente.** O servidor só emite `update-events` quando o *navegador* envia `create-event` ou `events-changed` (`server.mts:242-296`, `components/MyComponents/EventoForm.tsx:226`, `components/MyComponents/TableEventsAdmin.tsx:112,135,159`). Mudanças feitas pelo app mobile, por server action sem o cliente ou pelo worker de importação não propagam. Além disso, `create-event` não tem throttle: qualquer PROMOTER pode disparar `io.emit("update-events")` em loop e fazer todos os clientes conectados rebaixarem o catálogo inteiro (amplificação). O padrão correto já existe no projeto: `CommunitySignal` gravado na transação e worker/gateway (`docs/architecture.md:26`).
- **Estado em memória.** `activeUsers` e `recentlyNotifiedValidations` (`server.mts:32-33`) e o `sent` do worker (`server/notificationWorker.mts:11`) assumem uma única instância, o que `docs/architecture.md:30` reconhece. A presença usa o banco (`server/databasePresence.mts`). O push não tem lease: duas instâncias enviariam o mesmo push em duplicidade.

### 3.4 Workers e integrações

- **Jobs no Render gratuito.** Lembretes, encerramento automático (`ENDED`), envio de push e fila de importação só rodam no processo `server.mts` (`server.mts:86-95`), que hiberna no Render gratuito. O keepalive via GitHub Actions é best effort (`docs/render-keepalive.md`). Com o serviço dormindo ou suspenso por falta de horas, lembretes não saem, eventos passados continuam `PUBLISHED` e inscrições continuam abertas até o próximo boot.
- **Vazão de push.** São no máximo 50 notificações por minuto (`server/notificationWorker.mts:72`). Validar um evento de um promotor com 3.000 seguidores leva cerca de 1 hora para entregar. Se *um* dispositivo falha com erro transitório, a notificação é reenviada a *todos* os dispositivos no ciclo seguinte (`server/notificationWorker.mts:74-83`), gerando duplicatas por até 24 horas.
- **E-mail.** `nodemailer` usa `service: "gmail"` fixo e só texto puro (`lib/mail/verification.ts:4-10`, `lib/mail/recovery.ts:4-10`). O Gmail limita cerca de 500 envios por dia e não serve para produção. Não há e-mail transacional de inscrição, promoção da lista de espera, cancelamento ou lembrete.
- **"IA" de eventos.** Não há provedor de IA. É um leitor de JSON-LD de 5 domínios curados (`lib/aiEvents/provider.ts:8,89`) e `aiConfigured` sempre retorna `true` (`lib/aiEvents/provider.ts:272`). Funciona e é seguro (DNS/IP checado, limite de 2 MB), mas o nome "IA" no admin é marketing impreciso para um produto vendável.
- **Saúde.** `/api/socket` responde sempre `{"status":"available"}` sem checar nada (`app/api/socket/route.ts:7-11`; GET retornou 200 em 21 ms). `/healthz` existe só no modo `SOCKET_ONLY` e não consulta o banco (`server.mts:55-57`). Não há rastreamento de erros nem logs estruturados.
- **Métricas.** A deduplicação de view e clique em ingresso depende de um cookie que o cliente controla (`app/api/event-engagement/[id]/route.ts:14-19`). Um bot sem cookie infla as métricas do promotor à vontade. Prioridade P2.
- CSP está só em `Report-Only` (`next.config.mjs:56`).

### 3.5 Validação de entrada

Os eventos usam Zod completo (`schemas/eventInput.ts`). Comunidade, chat, party, importação e push também usam Zod. Algumas rotas usam checagem manual equivalente: `admin/reports/[id]`, `events/[id]/reports`, `check-in`, `impersonation/start` e `event-engagement`. `/api/register` delega ao schema, mas não trata JSON inválido. `toggleFavorite`, `setEventReminder` e `getPromoterProfile` aceitam `eventId` e `id` sem validar UUID. O Prisma lida com isso sem risco, mas registra erro.

## 4. Oportunidades priorizadas

| # | Prioridade | Título | Schema? | Versão sem schema? | Credencial externa? |
|---|---|---|---|---|---|
| BE-01 | P0 | Jobs agendados fora do socket hibernável (rotas cron + lock) | Não | Sim | Não (só `CRON_SECRET`) |
| BE-02 | P0 | Avisar inscritos em cancelamento, alteração e exclusão | Não | Sim | Não |
| BE-03 | P0 | Rate limit de login/cadastro, fim da enumeração e e-mail normalizado | Não | Sim | Não |
| BE-04 | P0 | Exclusão de usuário segura e limpeza de imagens no Blob | Não | Sim | Não |
| BE-05 | P1 | Realtime do catálogo pelo servidor (`CommunitySignal`) e throttle | Não | Sim | Não |
| BE-06 | P1 | API de catálogo paginada e enxuta (+ índices futuros) | Parcial (índices) | Sim | Não |
| BE-07 | P1 | Check-in por equipe, check-in manual e exportação CSV | Não | Sim | Não |
| BE-08 | P1 | E-mail transacional profissional (SMTP genérico + templates) | Não | Sim | Sim (provedor SMTP) |
| BE-09 | P1 | LGPD self-service: exportar dados e excluir a própria conta | Não | Sim | Não |
| BE-10 | P1 | Health check real, auditoria de admin e observabilidade | Não | Sim | Opcional (Sentry) |
| BE-11 | P2 | Push confiável: vazão, retry por dispositivo e lease | Não | Sim | Não |
| BE-12 | P2 | Feed ICS assinado para assinatura de agenda | Não | Sim | Não |

### BE-01 (P0): jobs agendados fora do servidor hibernável
- **Problema:** lembretes, `ENDED` automático, push e importação dependem do processo Socket.IO no Render gratuito (`server.mts:86-95`, `server/notificationWorker.mts:35-88`).
- **Solução:** extrair `scheduled()` para `lib/jobs/scheduled.ts` (puro, recebe `PrismaClient`) e expor `app/api/cron/scheduled/route.ts` (GET protegido por `Authorization: Bearer ${CRON_SECRET}`). Disparar pelo Vercel Cron (no plano Hobby o cron roda só uma vez por dia; para granularidade de minutos, usar o workflow do GitHub Actions já existente ou um plano pago) e manter o worker como fallback. Envolver cada job em `pg_try_advisory_lock` para que duas execuções (cron + socket) não colidam.
- **Arquivos:** `server/notificationWorker.mts`, `server/aiEventsWorker.mts`, `lib/aiEvents/service.ts`, novo `app/api/cron/*`, `vercel.json` (novo), `.github/workflows/`.

### BE-02 (P0): avisar quem confirmou presença
- **Problema:** `lib/eventNotifications.ts:5-22` ignora `EventRegistration`. Cancelamento, mudança de data/local e exclusão não chegam aos inscritos.
- **Solução:** adicionar `includeRegistrations` (padrão `true` em status públicos) com status `CONFIRMED`/`WAITLISTED`, e usá-lo em `cancelarEvento` (`lib/services/events.ts:135`), na atualização de evento publicado (`lib/services/events.ts:75`) e em `deleteEvents` (`app/(actions)/deleteEvents/action.ts:46`). No cancelamento, marcar as inscrições como `CANCELLED` na mesma transação, para liberar o QR e as listas.
- **Arquivos:** `lib/eventNotifications.ts`, `lib/services/events.ts`, `app/(actions)/deleteEvents/action.ts`.

### BE-03 (P0): rate limit de autenticação e fim da enumeração
- **Problema:** bcrypt ilimitado em `authorize` (`lib/auth/options.ts:47-67`) e em `validateUser`. A mensagem de conta não verificada sai antes da checagem de senha (`lib/services/credentials.ts:32-37`). O e-mail não é normalizado (`schemas/accountInput.ts:5`). `/api/register` não verifica origem e devolve 200 em erro.
- **Solução:** reaproveitar os buckets persistidos de `lib/services/passwordRecovery.ts:22-37` (`VerificationToken` com identificador `login-rate:email:<hash>` e `login-rate:client:<hash>`, sem schema novo) em um helper `lib/services/rateLimit.ts`. Conferir a senha *antes* de revelar o estado da conta. Aplicar `toLowerCase()` no cadastro e usar busca insensível no login. `/api/register`: `checkOrigin`, `readCommunityBody`, status HTTP correto e rate limit.
- **Arquivos:** `lib/auth/options.ts`, `lib/services/credentials.ts`, `lib/services/registration.ts`, `schemas/accountInput.ts`, `app/api/register/route.ts`, `components/login-form.tsx` (só as mensagens).

### BE-04 (P0): exclusão de usuário segura e limpeza do Blob
- **Problema:** a cascata `Events.user` (`prisma/schema.prisma:119`) apaga os eventos do promotor excluído (`lib/services/userAdministration.ts:51-61`). `deleteEvents` não apaga blobs (`app/(actions)/deleteEvents/action.ts:56-67`).
- **Solução:** na transação de `deleteUser`, antes de excluir: cancelar eventos futuros `PUBLISHED`, notificar inscritos e favoritos (BE-02) e fazer `events.updateMany({ where: { userId }, data: { userId: null } })` para preservar o histórico. Gravar `EventHistory`. Em `deleteEvents`, trocar o `fs` por `removeEventImages` (`lib/storage/eventImages.ts:24`). Passar `timeout` explícito às transações de lote.
- **Arquivos:** `lib/services/userAdministration.ts`, `app/(actions)/deleteEvents/action.ts`, `app/(actions)/validateEvents/action.ts`.

### BE-05 (P1): realtime do catálogo pelo servidor
- **Problema:** `update-events` só sai quando o cliente emite (`server.mts:242-296`). O evento `create-event` não tem throttle (vetor de amplificação), e mudanças do mobile ou de server actions não propagam.
- **Solução:** gravar `communitySignal.create({ data: { room: "events" } })` dentro das transações de criar, validar, cancelar, excluir e encerrar evento. Tratar a sala `events` em `dispatchCommunitySignal` como `io.emit("update-events")` com coalescência de cerca de 2 s. Remover ou ignorar `create-event` e `events-changed` vindos do cliente. Manter `event-validated` gerado no servidor.
- **Arquivos:** `server.mts`, `server/communityGateway.mts`, `server/communityAccess.mts`, `lib/services/events.ts`, `app/(actions)/validateEvents/action.ts`, `app/(actions)/deleteEvents/action.ts`, `components/MyComponents/EventoForm.tsx`, `components/MyComponents/CardEvents.tsx`, `components/MyComponents/TableEventsAdmin.tsx`.

### BE-06 (P1): catálogo paginado e enxuto
- **Problema:** payload sem limite (`app/(actions)/getAlllEvents/action.ts:4-8`), seleção pesada (`lib/eventQueries.ts:6-17`) e `events` sem índices.
- **Solução sem schema:** `GET /api/AllEvents?from=YYYY-MM-DD&limit=200&cursor=&bbox=` com `publicEventCardSelect` (sem `descricao` nem `carrossel`) e o detalhe sob demanda. Manter a resposta atual quando não houver parâmetros (compatível com o mobile). Paginar `/api/admin/events` e os eventos do promotor. **Para depois (schema):** `@@index([status, dataInicio])`, `@@index([userId, updatedAt])`, `@@index([status, dataFim])` em `Events`.
- **Arquivos:** `app/api/AllEvents/route.ts`, `app/(actions)/getAlllEvents/action.ts`, `lib/eventQueries.ts`, `app/api/admin/events/route.ts`, `lib/services/promoters.ts`, `prisma/schema.prisma` (ciclo futuro).

### BE-07 (P1): check-in por equipe, manual e CSV
- **Problema:** só o dono ou um ADMIN valida a entrada (`lib/services/attendance.ts:189,199`, `lib/authPolicy.ts:25`). Não há check-in manual quando o participante está sem bateria, nem exportação da lista.
- **Solução:** permitir `CommunityTeamMember` (já modelado e gerido em `lib/community/events.ts:74-75`) no roster e no check-in. Criar `POST /api/events/[id]/check-in` com `{ registrationId }` para check-in manual com auditoria. Criar `GET /api/events/[id]/attendees.csv` (dono, equipe ou admin, com escape contra injeção de fórmula). Ajustar `canAccessPath` para `/myEvents/[id]/checkin`, validando a equipe no servidor.
- **Arquivos:** `lib/services/attendance.ts`, `app/api/events/[id]/check-in/route.ts`, novo `app/api/events/[id]/attendees/route.ts`, `lib/authPolicy.ts`, `app/(private)/myEvents/[id]/checkin/page.tsx`.

### BE-08 (P1): e-mail transacional profissional
- **Problema:** Gmail fixo e texto puro (`lib/mail/*.ts`). Nenhum e-mail de inscrição, lista de espera, cancelamento ou lembrete.
- **Solução:** `lib/mail/transport.ts` com SMTP genérico (`SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, com fallback para o Gmail atual) e templates HTML + texto. Enviar fora da transação (após commit), a partir do worker/cron, usando as `Notification` de tipo `CHECKIN`/`EVENT_CHANGE`/`EVENT_REMINDER`. Sem schema: usar uma janela por `createdAt` e uma chave idempotente em `VerificationToken`, ou um `groupKey`.
- **Arquivos:** `lib/mail/verification.ts`, `lib/mail/recovery.ts`, novo `lib/mail/transport.ts`, `server/notificationWorker.mts` ou `app/api/cron/*`.

### BE-09 (P1): LGPD self-service
- **Problema:** direitos atendidos só por e-mail (`app/(publicRoutes)/privacidade/solicitacoes/page.tsx:18,31`). O contato de privacidade cai para um e-mail pessoal fixo no código (`lib/privacy.ts:2-3`).
- **Solução:** `GET /api/account/export` (JSON com perfil, eventos, inscrições, favoritos, notificações, mensagens próprias). `POST /api/account/delete` com confirmação de senha ou reautenticação, reaproveitando o fluxo de `deleteUser` + BE-04 (revogação já via `communitySignal`). Exigir `PRIVACY_CONTACT_EMAIL` em produção, sem fallback pessoal.
- **Arquivos:** novos `app/api/account/export/route.ts` e `app/api/account/delete/route.ts`, `lib/services/userAdministration.ts`, `lib/privacy.ts`.

### BE-10 (P1): saúde, auditoria e observabilidade
- **Problema:** `/api/socket` sempre "available" (`app/api/socket/route.ts:7-11`). `/healthz` não consulta o banco. Mudança de papel e exclusão de usuário não são auditadas (`lib/services/userAdministration.ts:18-87`). Só há `console.*`.
- **Solução:** `GET /api/health` com `SELECT 1` e timeout, mais o último heartbeat do worker (linha `VerificationToken` com identifier `worker-heartbeat`, sem schema), sem expor detalhes. Registrar papel e exclusão em `UserSuspensionAudit` com `action` `ROLE_CHANGE`/`DELETE` (a coluna é `String`, então não precisa de schema). Bloquear a promoção a ADMIN, ou exigir confirmação. Adicionar logger estruturado (`lib/log.ts`) e, opcionalmente, Sentry.
- **Arquivos:** `app/api/socket/route.ts`, novo `app/api/health/route.ts`, `server.mts`, `lib/services/userAdministration.ts`, `app/api/admin/impersonation/audit/route.ts` (para exibir).

### BE-11 (P2): push confiável
- **Problema:** 50 por minuto, reenvio para todos os dispositivos quando um deles falha e nenhum lease entre instâncias (`server/notificationWorker.mts:71-85`).
- **Solução:** lote maior com concorrência limitada (por exemplo, 10 em paralelo), `pushedAt` marcado depois de *tentar* todos os dispositivos, retry só para os dispositivos que falharam (contagem de falhas em memória, descarte depois de N), e `pg_try_advisory_lock('push-delivery')`.
- **Arquivos:** `server/notificationWorker.mts`, `lib/notifications/push.ts`.

### BE-12 (P2): feed ICS assinado
- **Problema:** `/api/my-calendar` exige cookie (`app/api/my-calendar/route.ts:9-10`), então não dá para assinar a agenda no Google ou Apple Calendar.
- **Solução:** `GET /api/my-calendar/feed?u=<id>&s=<hmac>` com HMAC usando `CHECKIN_SIGNING_SECRET` e `sessionVersion` na assinatura (revogável ao trocar a senha).
- **Arquivos:** `app/api/my-calendar/route.ts`, novo `app/api/my-calendar/feed/route.ts`, `lib/eventCalendar.ts`.

## 5. Recursos visuais ou não ligados de verdade

- `app/api/socket/route.ts:7-11`: diz "available" sem verificar o socket nem o banco.
- `lib/aiEvents/provider.ts:272`: `aiConfigured` sempre `true`. "Eventos com IA" é um importador de JSON-LD sem IA.
- `server.mts:242-296`: o realtime do catálogo depende do cliente emitir. Mudanças vindas de server actions sem esse cliente, do mobile ou do worker de importação não propagam.
- `next.config.mjs:56`: CSP só em modo de relatório.
- `lib/auth/options.ts:247`: `jwt.maxAge` de 3 minutos é sobrescrito na prática (sessão de 30 dias).
- `app/(publicRoutes)/privacidade/solicitacoes/page.tsx:31`: a página afirma que não há exclusão automática. Não existe exportação nem exclusão self-service.
- `app/api/register/route.ts:19`: devolve HTTP 200 mesmo com `status: "error"`.
- `app/(actions)/getAllUsers/action.ts`: sem `"use server"` e sem consumidores (código morto).

## 6. Validação desta auditoria

- `GET /api/AllEvents` → 200, 3 eventos, 4.497 B, 1,2 s. `GET /api/socket` → 200 (resposta fixa). `GET /api/admin/events` e `/api/dataAllUser` sem sessão → 403. `GET /api/event-calendar/x` → 404.
- Nenhum comando de banco, migração, script `:db`/`:http` nem requisição mutável foi executado.
