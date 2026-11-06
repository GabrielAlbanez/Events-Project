# Auditoria EventMap

Data: 05/11/2026 · Produção: http[caminho local omitido]

## Resumo executivo — ATENÇÃO

Checkout auditado: [caminho local omitido] A raiz Git é [caminho local omitido] A main local está no merge d6ff8fe, sete commits à frente da main remota. O deploy público inclui as correções já publicadas por CLI e o avatar recuperado. O processo de Socket.IO é um deploy independente.

Foram sondadas 32 páginas, 44 módulos de API e cinco rotas de controle, em produção e no servidor local em localhost:3100. Nenhuma resposta 5xx foi observada nessa amostra. Acesso anônimo bloqueado, 404 de recurso inexistente e OPTIONS 204 contam apenas como validação da condição exercitada.

| Prioridade | Achado | Evidência e ação |
|---|---|---|
| Alto | Uploads usam disco local em funções da Vercel | A foto recuperada foi empacotada manualmente e um avatar legado continua sem arquivo. Migrar para armazenamento persistente com autorização por recurso e preservar URLs antigas. lib/storage/profileImages.ts:39, lib/storage/eventImages.ts:9, lib/storage/chatImages.ts:11, app/api/media/[filename]/route.ts:16. |
| Alto | SMTP ausente em produção | EMAIL_USER e EMAIL_PASS ausentes na Vercel. A recuperação tem ramo de indisponibilidade 503. Configurar provedor e validar cadastro, confirmação, reenvio e redefinição com caixa de teste. lib/services/passwordRecovery.ts:23 e lib/mail/verification.ts:9. |
| Alto | Entrega direta de notificação sem confirmação | No teste autenticado anterior, convite de comunidade passou, mas a notificação inserida diretamente ficou sem sinal por 18 s. Investigar polling, reprocessamento e entrega após reinício. server/notificationWorker.mts:13–19. |
| Alto | Continuidade do Socket.IO e busca por hora dependem do Render gratuito | Health 200 e WebSocket passaram nesta auditoria. Hibernação limita disponibilidade sem tráfego. Medir retomada a frio e configurar processo sempre ativo para garantir a agenda por hora. server.mts:83–94. |
| Médio | Cabeçalhos de segurança e SEO incompletos | HSTS presente; CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy e Permissions-Policy ausentes na home. Robots e sitemap retornaram 404. Planejar política compatível com Maps, OAuth e Socket.IO. next.config.mjs:9 e app/layout.tsx:21. |

Nenhum bug foi alterado nesta auditoria. Nenhuma conta ou registro de produção foi criado, alterado ou removido. O teste de perfis usou a sessão já aberta com autorização do usuário.


## Rotas e evidência HTTP

GET anônimo e OPTIONS para métodos de escrita. OPTIONS verifica a existência do método, não executa sua lógica. IDs sintéticos representam recurso inexistente. Tempos são uma amostra por rota, sem teste de carga.

| Item | Método testado | Local | Produção | Evidência do código |
|---|---|---|---|---|
| `/admin/auditoria` | GET | 307 · 12 ms → /login | 307 · 40 ms → /login | `app/(adminRoutes)/admin/auditoria/page.tsx` · middleware/página |
| `/admin/conexoes-denuncias` | GET | 307 · 5 ms → /login | 307 · 57 ms → /login | `app/(adminRoutes)/admin/conexoes-denuncias/page.tsx` · middleware/página |
| `/admin/eventos-ia` | GET | 307 · 5 ms → /login | 307 · 63 ms → /login | `app/(adminRoutes)/admin/eventos-ia/page.tsx` · admin |
| `/admin` | GET | 307 · 4 ms → /login | 307 · 81 ms → /login | `app/(adminRoutes)/admin/page.tsx` · middleware/página |
| `/admin/reports` | GET | 307 · 5 ms → /login | 307 · 62 ms → /login | `app/(adminRoutes)/admin/reports/page.tsx` · middleware/página |
| `/confirmar-email` | GET | 200 · 36 ms | 200 · 219 ms | `app/(auth)/confirmar-email/page.tsx` · middleware/página |
| `/login` | GET | 200 · 68 ms | 200 · 364 ms | `app/(auth)/login/page.tsx` · middleware/página |
| `/recuperar-senha` | GET | 200 · 52 ms | 200 · 293 ms | `app/(auth)/recuperar-senha/page.tsx` · middleware/página |
| `/redefinir-senha` | GET | 200 · 58 ms | 200 · 186 ms | `app/(auth)/redefinir-senha/page.tsx` · middleware/página |
| `/register` | GET | 200 · 117 ms | 200 · 366 ms | `app/(auth)/register/page.tsx` · middleware/página |
| `/verifyEmail` | GET | 200 · 83 ms | 200 · 183 ms | `app/(auth)/verifyEmail/page.tsx` · middleware/página |
| `/CriarEvento` | GET | 307 · 3 ms → /login | 307 · 35 ms → /login | `app/(private)/CriarEvento/page.tsx` · middleware/página |
| `/Profile` | GET | 307 · 7 ms → /login | 307 · 41 ms → /login | `app/(private)/Profile/page.tsx` · middleware/página |
| `/atividade` | GET | 307 · 6 ms → /login | 307 · 54 ms → /login | `app/(private)/atividade/page.tsx` · middleware/página |
| `/eventos/[id]/editar` | GET | 307 · 5 ms → /login | 307 · 56 ms → /login | `app/(private)/eventos/[id]/editar/page.tsx` · middleware/página |
| `/myEvents/[id]/checkin` | GET | 307 · 15 ms → /login | 307 · 34 ms → /login | `app/(private)/myEvents/[id]/checkin/page.tsx` · middleware/página |
| `/myEvents` | GET | 307 · 53 ms → /login | 307 · 42 ms → /login | `app/(private)/myEvents/page.tsx` · middleware/página |
| `/notificacoes` | GET | 307 · 50 ms → /login | 307 · 35 ms → /login | `app/(private)/notificacoes/page.tsx` · middleware/página |
| `/perfil-conexoes` | GET | 307 · 10 ms → /login | 307 · 60 ms → /login | `app/(private)/perfil-conexoes/page.tsx` · middleware/página |
| `/resultados` | GET | 307 · 10 ms → /login | 307 · 42 ms → /login | `app/(private)/resultados/page.tsx` · middleware/página |
| `/salas/[id]` | GET | 307 · 6 ms → /login | 307 · 40 ms → /login | `app/(private)/salas/[id]/page.tsx` · middleware/página |
| `/salas` | GET | 307 · 6 ms → /login | 307 · 60 ms → /login | `app/(private)/salas/page.tsx` · middleware/página |
| `/salvos` | GET | 307 · 6 ms → /login | 307 · 31 ms → /login | `app/(private)/salvos/page.tsx` · middleware/página |
| `/EventsCreated` | GET | 200 · 117 ms | 200 · 241 ms | `app/(publicRoutes)/EventsCreated/page.tsx` · middleware/página |
| `/demonstracao` | GET | 200 · 47 ms | 200 · 191 ms | `app/demonstracao/page.tsx` · middleware/página |
| `/eventos/[id]/chat` | GET | 307 · 6 ms → /login | 307 · 59 ms → /login | `app/eventos/[id]/chat/page.tsx` · middleware/página |
| `/eventos/[id]/comunidade` | GET | 200 · 81 ms | 200 · 191 ms | `app/eventos/[id]/comunidade/page.tsx` · middleware/página |
| `/eventos/[id]/conexoes/[matchId]` | GET | 307 · 23 ms → /login | 307 · 36 ms → /login | `app/eventos/[id]/conexoes/[matchId]/page.tsx` · middleware/página |
| `/eventos/[id]/conexoes` | GET | 307 · 14 ms → /login | 307 · 35 ms → /login | `app/eventos/[id]/conexoes/page.tsx` · middleware/página |
| `/eventos/[id]` | GET | 200 · 1925 ms | 200 · 613 ms | `app/eventos/[id]/page.tsx` · middleware/página |
| `/` | GET | 200 · 68 ms | 200 · 221 ms | `app/page.tsx` · middleware/página |
| `/promotores/[id]` | GET | 404 · 366 ms | 404 · 249 ms | `app/promotores/[id]/page.tsx` · middleware/página |
| `/api/AllEvents` (GET) | GET | 200 · 1918 ms · lista (3) | 200 · 154 ms · lista (3) | `app/api/AllEvents/route.ts` · ver handler |
| `/api/EventsUser` (POST) | OPTIONS | 204 · 9 ms · OPTIONS, POST | 204 · 152 ms · OPTIONS, POST | `app/api/EventsUser/route.ts` · sessão consultada |
| `/api/account/recovery` (POST) | OPTIONS | 204 · 43 ms · OPTIONS, POST | 204 · 188 ms · OPTIONS, POST | `app/api/account/recovery/route.ts` · ver handler |
| `/api/account/resend-verification` (POST) | OPTIONS | 204 · 11 ms · OPTIONS, POST | 204 · 161 ms · OPTIONS, POST | `app/api/account/resend-verification/route.ts` · ver handler |
| `/api/account/reset-password` (POST) | OPTIONS | 204 · 14 ms · OPTIONS, POST | 204 · 194 ms · OPTIONS, POST | `app/api/account/reset-password/route.ts` · ver handler |
| `/api/admin/ai-events` (GET, POST) | GET | 403 · 20 ms · objeto | 403 · 165 ms · objeto | `app/api/admin/ai-events/route.ts` · admin |
| `/api/admin/events` (GET) | GET | 403 · 10 ms · objeto | 403 · 157 ms · objeto | `app/api/admin/events/route.ts` · admin |
| `/api/admin/impersonation/audit` (GET) | GET | 403 · 15 ms · objeto | 403 · 162 ms · objeto | `app/api/admin/impersonation/audit/route.ts` · admin |
| `/api/admin/impersonation/end` (POST) | OPTIONS | 204 · 21 ms · OPTIONS, POST | 204 · 148 ms · OPTIONS, POST | `app/api/admin/impersonation/end/route.ts` · ver handler |
| `/api/admin/impersonation/start` (POST) | OPTIONS | 204 · 20 ms · OPTIONS, POST | 204 · 153 ms · OPTIONS, POST | `app/api/admin/impersonation/start/route.ts` · ver handler |
| `/api/admin/impersonation/status` (GET) | GET | 200 · 9 ms · objeto | 200 · 140 ms · objeto | `app/api/admin/impersonation/status/route.ts` · ver handler |
| `/api/admin/party-reports` (GET, POST) | GET | 401 · 14 ms · objeto | 401 · 153 ms · objeto | `app/api/admin/party-reports/route.ts` · sessão consultada |
| `/api/admin/reports/[id]` (PATCH) | OPTIONS | 204 · 21 ms · OPTIONS, PATCH | 204 · 156 ms · OPTIONS, PATCH | `app/api/admin/reports/[id]/route.ts` · admin |
| `/api/admin/reports` (GET) | GET | 403 · 11 ms · objeto | 403 · 150 ms · objeto | `app/api/admin/reports/route.ts` · admin |
| `/api/admin/users/[id]/events` (GET) | GET | 403 · 14 ms · objeto | 403 · 149 ms · objeto | `app/api/admin/users/[id]/events/route.ts` · admin |
| `/api/admin/users/[id]/suspension` (POST) | OPTIONS | 204 · 17 ms · OPTIONS, POST | 204 · 151 ms · OPTIONS, POST | `app/api/admin/users/[id]/suspension/route.ts` · admin |
| `/api/auth/[...nextauth]` (GET, POST) | GET | 200 · 11 ms · objeto | 200 · 163 ms · objeto | `app/api/auth/[...nextauth]/route.ts` · ver handler |
| `/api/community/activity` (GET) | GET | 401 · 10 ms · objeto | 401 · 153 ms · objeto | `app/api/community/activity/route.ts` · sessão consultada |
| `/api/community/events/[eventId]` (GET, POST) | GET | 404 · 667 ms · objeto | 404 · 196 ms · objeto | `app/api/community/events/[eventId]/route.ts` · sessão consultada |
| `/api/community/rooms/[roomId]` (GET, POST) | GET | 401 · 15 ms · objeto | 401 · 156 ms · objeto | `app/api/community/rooms/[roomId]/route.ts` · sessão consultada |
| `/api/community/rooms` (GET, POST) | GET | 401 · 9 ms · objeto | 401 · 155 ms · objeto | `app/api/community/rooms/route.ts` · sessão consultada |
| `/api/dataAllUser` (GET) | GET | 403 · 8 ms · objeto | 403 · 154 ms · objeto | `app/api/dataAllUser/route.ts` · admin |
| `/api/event-calendar/[id]` (GET) | GET | 404 · 142 ms | 404 · 171 ms | `app/api/event-calendar/[id]/route.ts` · ver handler |
| `/api/event-chat/[eventId]` (GET, POST) | GET | 401 · 418 ms · objeto | 401 · 179 ms · objeto | `app/api/event-chat/[eventId]/route.ts` · sessão consultada |
| `/api/event-engagement/[id]` (POST) | OPTIONS | 204 · 2 ms · OPTIONS, POST | 204 · 160 ms · OPTIONS, POST | `app/api/event-engagement/[id]/route.ts` · ver handler |
| `/api/events/[id]/check-in-token` (GET) | GET | 401 · 16 ms · objeto | 401 · 156 ms · objeto | `app/api/events/[id]/check-in-token/route.ts` · sessão consultada |
| `/api/events/[id]/check-in` (GET, POST) | GET | 401 · 16 ms · objeto | 401 · 153 ms · objeto | `app/api/events/[id]/check-in/route.ts` · sessão consultada |
| `/api/events/[id]/registration` (GET, POST, DELETE) | GET | 404 · 287 ms · objeto | 404 · 165 ms · objeto | `app/api/events/[id]/registration/route.ts` · sessão consultada |
| `/api/events/[id]/reports` (POST) | OPTIONS | 204 · 11 ms · OPTIONS, POST | 204 · 163 ms · OPTIONS, POST | `app/api/events/[id]/reports/route.ts` · sessão consultada |
| `/api/media/[filename]` (GET) | GET | 404 · 11 ms | 404 · 158 ms | `app/api/media/[filename]/route.ts` · ver handler |
| `/api/my-calendar` (GET) | GET | 401 · 9 ms | 401 · 149 ms | `app/api/my-calendar/route.ts` · sessão consultada |
| `/api/party-connections/[eventId]/matches/[matchId]/images/[imageId]` (GET) | GET | 401 · 17 ms · objeto | 401 · 147 ms · objeto | `app/api/party-connections/[eventId]/matches/[matchId]/images/[imageId]/route.ts` · sessão consultada |
| `/api/party-connections/[eventId]/matches/[matchId]/images` (POST) | OPTIONS | 204 · 9 ms · OPTIONS, POST | 204 · 147 ms · OPTIONS, POST | `app/api/party-connections/[eventId]/matches/[matchId]/images/route.ts` · sessão consultada |
| `/api/party-connections/[eventId]/matches/[matchId]` (GET, POST, PATCH) | GET | 401 · 21 ms · objeto | 401 · 156 ms · objeto | `app/api/party-connections/[eventId]/matches/[matchId]/route.ts` · sessão consultada |
| `/api/party-connections/[eventId]` (GET, POST) | GET | 401 · 13 ms · objeto | 401 · 163 ms · objeto | `app/api/party-connections/[eventId]/route.ts` · sessão consultada |
| `/api/party-profile-media/[assetId]` (GET) | GET | 401 · 17 ms | 401 · 183 ms | `app/api/party-profile-media/[assetId]/route.ts` · sessão consultada |
| `/api/party-profile` (GET, PUT) | GET | 401 · 17 ms · objeto | 401 · 166 ms · objeto | `app/api/party-profile/route.ts` · sessão consultada |
| `/api/profile-media/[assetId]` (GET) | GET | 404 · 276 ms | 404 · 171 ms | `app/api/profile-media/[assetId]/route.ts` · ver handler |
| `/api/push/subscriptions` (GET, POST, DELETE) | GET | 401 · 7 ms · objeto | 401 · 163 ms · objeto | `app/api/push/subscriptions/route.ts` · sessão consultada |
| `/api/register` (POST) | OPTIONS | 204 · 12 ms · OPTIONS, POST | 204 · 177 ms · OPTIONS, POST | `app/api/register/route.ts` · ver handler |
| `/api/socket-ticket` (POST) | OPTIONS | 404 · 73 ms | 204 · 160 ms · OPTIONS, POST | `app/api/socket-ticket/route.ts` · sessão consultada |
| `/api/socket` (GET) | GET | 200 · 29 ms · objeto | 200 · 323 ms · objeto | `app/api/socket/route.ts` · ver handler |
| `/api/upload` (POST) | OPTIONS | 204 · 6 ms · OPTIONS, POST | 204 · 143 ms · OPTIONS, POST | `app/api/upload/route.ts` · sessão consultada |
| `/api/verifyEmail` (GET) | GET | 400 · 6 ms · objeto | 400 · 144 ms · objeto | `app/api/verifyEmail/route.ts` · ver handler |
| `/nao-existe-auditoria-20261105` | GET | 404 · 52 ms | 404 · 181 ms | sondagem adicional |
| `/robots.txt` | GET | 404 · 22 ms | 404 · 180 ms | sondagem adicional |
| `/sitemap.xml` | GET | 404 · 22 ms | 404 · 172 ms | sondagem adicional |
| `/api/event-calendar/5a2a394c-a3fc-4d70-8b07-8b85896dbf58` | GET | 200 · 909 ms | 200 · 192 ms | sondagem adicional |
| `/api/events/5a2a394c-a3fc-4d70-8b07-8b85896dbf58/registration` | GET | 200 · 536 ms · objeto | 200 · 213 ms · objeto | sondagem adicional |

## Cabeçalhos da home

- strict-transport-security presente
- content-security-policy ausente
- x-content-type-options ausente
- x-frame-options ausente
- referrer-policy ausente
- permissions-policy ausente

## Contratos por família de API

Os métodos e arquivos individuais constam na tabela. A autenticação depende do método e do recurso; as respostas anônimas da tabela não substituem um teste autenticado. Os caminhos dinâmicos usam IDs na URL.

| Família | Entrada e saída | Autorização |
|---|---|---|
| AllEvents, EventsUser, dataAllUser | Lista pública de eventos; consulta de eventos do usuário; dados administrativos de contas. Respostas JSON. | Pública, conta autorizada e administrador, respectivamente. |
| auth, register, verifyEmail, account/* | Sessão/CSRF/provedores e callbacks NextAuth; dados de cadastro; token de confirmação; e-mail de recuperação/reenvio ou token e nova senha. JSON ou redirecionamento. | Públicos por desenho, com prova por sessão, token, CSRF e limites conforme ação. |
| event-calendar, my-calendar | ID do evento ou sessão; retorna calendário ICS. | Calendário de evento publicado é público; calendário pessoal exige conta. |
| event-engagement | ID e métrica de engajamento; confirma registro ou retorna erro. | A origem e o evento são validados; a proteção não se limita a 401/403. |
| events/*/registration, check-in, check-in-token, reports | ID de evento; consultar/criar/cancelar inscrição, consultar/confirmar entrada, gerar QR e enviar denúncia. JSON, token ou erro. | Estado público da inscrição pode ser consultado anonimamente; ações exigem conta e permissões de inscrito ou organizador conforme método. |
| event-chat | ID, cursores de histórico ou clientId e texto; retorna histórico ou mensagem. | Organizador responsável, administrador ou participante com inscrição confirmada. |
| community/activity, events, rooms | Atividade pessoal, leitura/mutação de comunidade e salas; ações validadas por esquema; retorna snapshots e resultados JSON. | Atividade e salas exigem conta; visibilidade do evento, vínculo e papel dependem da ação. |
| party-profile, party-profile-media, party-connections | Perfil, participação, interação, match e anexos; GET/PUT/POST/PATCH conforme tabela. JSON ou mídia. | Sessão, participação e autorização por par; binários privados são servidos após checagem. |
| upload, media, profile-media | Multipart para alterar foto; nome validado ou identificador para download. JSON ou binário. | Upload exige sessão e origem; leitura da imagem de perfil depende da rota e visibilidade. |
| push/subscriptions | Endpoint, chaves de inscrição e remoção; JSON. | Conta autenticada; vínculo com o titular. |
| socket-ticket, socket | POST de ticket a partir da sessão e origem confiável; GET da rota legada. | 204 sem sessão, ticket com sessão válida, 403 para origem indevida. O GET legado 200 não é handshake. |
| admin/* | Paginação, IDs, estados de denúncias, configurações do importador, suspensão e troca temporária de identidade. JSON. | Admin para ações administrativas; status de troca pode retornar estado anônimo neutro. |

## Diferenças e integrações

- **Vercel, nomes presentes:** DATABASE_URL, DATABASE_PRISMA_DATABASE_URL, DATABASE_URL_POOLED, DATABASE_POSTGRES_URL, EVENTMAP_PRODUCTION_DATABASE_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXT_PUBLIC_BASE_URL, NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, NEXT_PUBLIC_SOCKET_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, SOCKET_TICKET_SECRET. A listagem não expôs os valores.
- **Ausentes na Vercel:** EMAIL_USER, EMAIL_PASS, CHECKIN_SIGNING_SECRET, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY e WEB_PUSH_SUBJECT. CHECKIN_SIGNING_SECRET usa NEXTAUTH_SECRET como fallback no código; validar compatibilidade com o mobile em lib/services/attendance.ts:140. Web Push externo exige configuração própria no processo que o envia.
- **Variáveis de processo:** ANALYZE é de build. NODE_ENV, VERCEL_ENV, PORT e HOSTNAME são de runtime. SOCKET_ONLY, SOCKET_IO_ALLOWED_ORIGINS e DATABASE_LISTEN_URL pertencem ao servidor dedicado. TRUST_PROXY_IP é opcional; precisa de um proxy confiável. Vars de scripts de teste não são requisitos da Vercel.
- **URLs:** os localhost encontrados em package.json:10, server.mts:24/119 e lib/adminAuth.ts:11 são defaults de dev ou URLs sintéticas para ler cookies. lib/publicUrl.ts:15 tem fallback localhost se a configuração canônica faltar. A resposta em HTTPS e o callback Google publicado foram verificados anteriormente. A inspeção de nomes não permite confirmar todos os valores privados.
- **Banco:** produção seleciona a conexão Neon por EVENTMAP_PRODUCTION_DATABASE_URL em lib/prisma.ts:5–10. O ambiente local também usa o Neon. Prisma informou 12 migrações e esquema atualizado. A API listou três eventos nos dois ambientes. Não há script de seed no package.json nem seed identificado em prisma; presença dos eventos não demonstra execução de seed.
- **Modelos e escrita:** prisma/schema.prisma:10–631 contém contas/sessões/tokens; eventos/séries/histórico/inscrições/denúncias; favoritos/seguidores/métricas; notificações/push; comunidade/filas/tarefas/salas/outbox; chat/perfis/conexões/matches; importação e auditoria administrativa. Login e GETs leem dados. Cadastro, publicação, inscrições, check-in, chat, mutações de comunidade e administração escrevem conforme os respectivos handlers/actions.
- **Tempo real:** cliente em lib/socketClient.ts:5, ticket em app/api/socket-ticket/route.ts e gateway no Render em ws[caminho local omitido] Nesta auditoria, health 200, transporte websocket, inscrição privada anônima negada, ticket 204 na origem oficial e 403 para origem externa. Não foi identificado SSE. O código usa polling complementar e workers do banco. Testes autenticados anteriores passaram para chat de evento, convite, reconexão e revogação; não foram repetidos com contas reais.
- **Mapas, pagamento e analytics:** Google Maps usa NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. O mapa de produção foi confirmado com três marcadores no deploy anterior. A compra é link externo, não foi encontrado checkout interno; métricas do produto usam a API de engajamento. Dependência Cloudinary consta no pacote, sem fluxo de produção identificado nesta revisão. Nenhum pagamento ou analytics externo foi acionado.
- **Arquivos:** next.config.mjs autoriza HTTPS para lh3.googleusercontent.com, cdnb.artstation.com e pbs.twimg.com. O avatar recuperado apareceu na sessão autenticada. Upload novo e imagem privada de chat não foram escritos em produção.
- **Runtime:** consulta filtrada do deploy [identificador omitido] retornou apenas o resumo, sem registros de warning/error/fatal na resposta. Consulta mais ampla por ambiente falhou na CLI; isso limita a conclusão aos dados retornados para o deploy.
- **Erros e desempenho:** 404 real passou. 500 deliberado não foi provocado. O código tem boundaries em eventos, promotores e resultados. Produção, amostra: home 221 ms, login 364 ms, lista de eventos 154 ms, ICS real 192 ms e inscrição real 213 ms. São tempos HTTP individuais, não Core Web Vitals.
- **Middleware e papéis:** middleware.ts e lib/authPolicy.ts controlam login e papel; verificações finas ficam nos serviços. Anônimo recebeu 307 em páginas protegidas. A conta disponível abriu a criação e a lista de eventos, mas /admin redirecionou à home.

## Navegador e cobertura pendente

| Item | Local | Produção | Prioridade |
|---|---|---|---|
| Home, perfil, notificações, salvos, atividade, salas, perfil de conexões, meus eventos e criar evento | HTTP anônimo na tabela | Sessão persistiu entre navegações completas; 390 px e 1440 px, sem overflow horizontal de documento | Médio |
| Console na sessão auditada | Não medido | Zero erros e um aviso na aba consultada; não houve captura isolada para cada rota | Médio |
| Login Google e foto | Histórico local e configuração | Login Google validado no deploy anterior; sessão e foto reapareceram nesta auditoria | Alto |
| Cadastro, logout, recuperação, reenvio e confirmação | Suítes prévias; revalidação completa pendente | Páginas/OPTIONS acessíveis; operação autenticada e e-mails pendentes | Alto |
| Admin, denúncias, moderação, impersonação, publicação/importação | Rotas e checagens anônimas na tabela | Sessão disponível sem papel admin; operações não exercitadas | Alto |
| Check-in, inscrição e cancelamento, criação de evento, engajamento, upload e relatórios | Implementação mapeada | Leituras/OPTIONS passaram nos casos da tabela; escritas pendentes | Alto |
| Chat, comunidade e notificações entre duas sessões | Suítes anteriores | WebSocket público confirmado agora; chat/convite autenticados têm evidência anterior. Toast visual, push, match, perfil e casos especiais pendentes | Alto |
| SEO e 404/500 | 404 confirmado | 404 confirmado, sitemap/robots ausentes, 500 não provocado | Médio |

Para concluir, deixe abertas sessões separadas de duas contas de teste, uma organizadora e outra participante, além de admin de teste. A conta atualmente aberta é suficiente para leitura de perfil, agenda e páginas pessoais. Forneça o ID de um evento marcado TESTE-AUDITORIA que aceite inscrição e check-in, uma sala ou match de teste, uma imagem sem dados pessoais e uma caixa de e-mail de teste. Use perfis de navegador separados para evitar que um login substitua o outro. Para push, é necessário um dispositivo com permissão explícita e VAPID configurado. Não envie senhas, cookies ou chaves pelo chat.

## Checklist manual

- [ ] Desktop e celular: abrir home, mapa, agenda, detalhe, perfil, login, cadastro e páginas privadas nos dois temas; conferir console e rolagem.
- [ ] Logar como visitante, organizador e admin em perfis separados; recarregar, sair em uma sessão e conferir bloqueio das páginas privadas.
- [ ] Criar evento TESTE-AUDITORIA, editar, revisar, publicar, inscrever, cancelar, exportar ICS e validar QR com participante de teste.
- [ ] Trocar mensagem e convite entre duas contas, conferir toast na conta destinatária, reconectar e verificar revogação de acesso.
- [ ] Testar arquivo válido e inválido, imagem privada e avatar após um novo deploy; conferir confirmação, redefinição e push em caixa/dispositivo de teste.
- [ ] Simular 500 apenas em ambiente isolado. Conferir metadados de evento, tempo de carregamento em rede móvel e primeiro WebSocket após hibernação.

### Ordem de correção

1. Persistir mídia e migrar arquivos legados. lib/storage/profileImages.ts:39, lib/storage/chatImages.ts:11, lib/storage/eventImages.ts:9.
2. Configurar SMTP e fechar o teste de cadastro/recuperação. lib/services/passwordRecovery.ts:23 e lib/mail/verification.ts:9.
3. Investigar polling e completar testes de notificação. server/notificationWorker.mts:13 e server/accountRevocation.mts:54.
4. Garantir disponibilidade do processo de Socket.IO e da busca. server.mts:83 e lib/socketClient.ts:5.
5. Adicionar política de cabeçalhos, sitemap e robots. next.config.mjs:9 e app/layout.tsx:21.


## Sondagens complementares desta auditoria

- POST com JSON incompleto e origem externa foi bloqueado com HTTP 403 em socket-ticket, community/rooms, event-chat, registration e reports. Quatro retornaram JSON e socket-ticket retornou corpo vazio. Isso exercita a proteção de origem, não a validação de payload com sessão válida.
- A agenda pública e a demonstração foram confirmadas sem overflow horizontal em 390 e 1440 px. Alguns formulários públicos ainda estavam navegando no instante da medição, portanto essa amostra não confirma a renderização responsiva de cada um deles.
- O código local contém socket-ticket, mas o servidor local já em execução devolveu 404 à sondagem OPTIONS. A produção devolveu 204. A comparação HTTP não garante que o processo local em execução tenha sido recompilado no HEAD.

## Correções na branch audit-fix — 05/11/2026

| Tarefa | Estado | Evidência e pendências |
|---|---|---|
| Uploads persistentes | Implementado no código, ativação pendente | Blob privado via BLOB_READ_WRITE_TOKEN, com chaves separadas para mídia pública do app e chat privado. As URLs antigas continuam válidas pela rota do app, sem reescrever referências. Migração em dry-run reconheceu oito arquivos. Falta criar o store privado, recuperar o avatar disponível do backup, aplicar a migração e comprovar upload e leitura em produção. O segundo avatar legado segue sem arquivo recuperado. |
| SMTP | Dependente de configuração | docs/deploy-email.md descreve Gmail com senha de app e precedência de NEXTAUTH_URL sobre NEXT_PUBLIC_BASE_URL. A suíte local testa links e tokens com transporte simulado. Falta envio real à caixa de teste. |
| Worker de notificações | Regressão corrigida no código | Foi reproduzido o caso em que o carimbo de criação precede a confirmação da transação e o cursor já avançou. O worker revisita 60 segundos e deduplica por ID. A regressão valida entrega ao destinatário após confirmação tardia e ausência de repetição. O incidente anterior no Render não teve erro correspondente nos logs da auditoria e ainda precisa de reteste com o worker atualizado. |
| Hibernação | Cliente ajustado | Timeout de conexão de 45 s, backoff de reconexão e aviso de status acessível. O processo gratuito hiberna após inatividade. Para executar a busca por hora sem depender de tráfego, considerar computação sempre ativa, a partir de aproximadamente US$ 7/mês no Render, antes de taxas ou consumo adicional. |
| Cabeçalhos | Implementados no código | Nosniff, DENY, política de referência, câmera e geolocalização limitadas à própria origem e microfone desabilitado. CSP começa em Report-Only em modo produção. Validação no deploy ainda pendente. |
| E2E autenticado | Roteiro preparado, execução pendente | scripts/e2e-producao.mjs requer Playwright, Chromium, três contas de teste, evento publicado com prefixo TESTE-AUDITORIA e conexão explicitamente autorizada para limpeza. |

### Ativação e revalidação

1. Crie um Vercel Blob **privado** e vincule-o ao projeto em Production. Confirme a variável BLOB_READ_WRITE_TOKEN na Vercel. Ela permanece apenas no servidor web. Execute scripts/migrate-uploads.mjs primeiro com --dry-run e depois com --apply num terminal com o token. Use --uploads= para a cópia local que contém o avatar recuperado. Para chat, --chat= aponta para a pasta privada correspondente. URLs públicas do app continuam em /uploads. Não apague os arquivos de origem.
2. Configure EMAIL_USER e EMAIL_PASS em Production e confirme NEXTAUTH_URL e NEXT_PUBLIC_BASE_URL. Use a caixa de teste para cadastro, reenvio e recuperação.
3. No Render, preserve DATABASE_URL, DATABASE_LISTEN_URL (Neon direto sem pooler), SOCKET_ONLY, SOCKET_TICKET_SECRET, NEXTAUTH_URL e SOCKET_IO_ALLOWED_ORIGINS. Publique o worker atualizado. O endereço HTTPS do serviço continua em NEXT_PUBLIC_SOCKET_URL na Vercel. Não foi contratado plano pago.
4. Depois de validar a mídia legada no Blob, publique a Vercel e verifique os cabeçalhos e o console de login, Maps, imagens e chat. Só aplique CSP em modo de bloqueio após confirmar as origens.
5. Instale Playwright sem gravar no manifesto (npm install --no-save --package-lock=false playwright) e execute npx playwright install chromium. Configure E2E_ORGANIZER_EMAIL, E2E_ORGANIZER_PASSWORD, E2E_ATTENDEE_EMAIL, E2E_ATTENDEE_PASSWORD, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_EVENT_ID e E2E_DATABASE_URL no terminal autorizado. Use apenas contas de teste e um evento TESTE-AUDITORIA de propriedade do organizador, publicado, com janela de check-in aberta e sem inscrição anterior do participante. Execute com E2E_ALLOW_WRITES=true. O roteiro limpa a mensagem, a inscrição e o rascunho que cria; verifique também avisos e trilhas de auditoria gerados pelo teste no evento de teste.

Limite de infraestrutura: o upload multipart continua sujeito ao limite de corpo da Vercel Functions. Imagens próximas do máximo de 5 MB da aplicação podem precisar de upload direto assinado para não passar pelo limite de 4,5 MB da plataforma.

### Finalização da audit-fix — 05/11/2026

| Item | Estado | Evidência ou dependência |
|---|---|---|
| Diagnóstico E2E | Corrigido e verificado localmente | Nome do erro e mensagem segura. Textos dinâmicos de terceiros são omitidos. A limpeza permanece no finally. |
| Uploads novos | Corrigido e verificado localmente | Limite por imagem de 4 MiB e multipart de 4.450.000 bytes. Arquivos antigos de até 5 MiB continuam legíveis. Upload direto assinado permanece como melhoria futura, sobretudo para galerias com múltiplos arquivos em uma requisição. |
| Robots e sitemap | Corrigido no código | URL canônica, home, agenda e eventos PUBLISHED. Aguardando verificação no deploy. |
| CSP | Corrigido no código | Report-Only com https e wss calculados a partir de NEXT_PUBLIC_SOCKET_URL. Configuração ausente ou inválida mantém apenas as origens padrão. |
| Variáveis e Blob | Pendente do responsável | BLOB_READ_WRITE_TOKEN não apareceu no ambiente Production. Migração e teste de persistência aguardam store privado vinculado. |
| Worker e Render | Verificação de produção pendente | A regressão de transação tardia passou localmente. Falta medir entrega sem duplicação com conta de teste. A hibernação exige uma janela sem tráfego observável. |
| E2E autenticado | Pendente do responsável | Nenhuma das nove variáveis E2E_* exigidas estava disponível no terminal. Não foram criados dados de produção. |

Lint e as oito suítes solicitadas passaram. Os simuladores de chat e perfil foram atualizados para carregar a constante de limite compartilhada.

### Resultado em produção — 05/11/2026

- PR #8 integrado à main no merge d694ecf depois de build, lint e oito suítes verdes. A Vercel marcou o deploy automático 3bl3rhya3 como Ready. O deploy DKBMfc7ebdZj8e113CtdXXSdxtJh também ficou Ready e preservou o avatar legado no pacote de produção. O avatar respondeu HTTP 200. O arquivo permanece fora do Git.
- Corrigido e verificado em produção: HEAD da home devolveu nosniff, DENY, Referrer-Policy, Permissions-Policy e CSP Report-Only com HTTPS e WSS do Render. Robots e sitemap responderam 200. O sitemap teve cinco URLs canônicas, sendo home, agenda e três eventos publicados.
- No navegador foram visitados mapa, agenda, detalhe, chat e perfil. A sessão ativa redirecionou login à home. O mapa exibiu os três eventos. Não foram observadas violações de CSP nessa amostra. A cobertura não inclui novo OAuth, mensagem enviada no chat ou upload autenticado.
- O Render confirmou Live no deploy [identificador omitido] e commit 45df3ad. Os logs registraram servidor iniciado e listener PostgreSQL ativo. O WebSocket conectou em 700 ms. A janela de 20 minutos sem tráfego de terceiros ou de abas abertas não foi comprovada, então esse tempo não é de partida a frio.
- Pendente do responsável: criar Blob privado vinculado a Production, configurar Gmail e as nove variáveis E2E da tabela anterior. Sem BLOB_READ_WRITE_TOKEN, a migração e o teste de upload após redeploy foram interrompidos. A notificação de produção em até 60 s sem duplicação aguarda conta de teste.
- Web Push: configurar os três valores WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY e WEB_PUSH_SUBJECT tanto na Vercel, onde a rota de inscrição os exige, quanto no Render, onde o worker envia. A chave de check-in deve ser compartilhada pela Vercel e API mobile.

## Continuação audit-followup — 05/11/2026

Esta seção substitui as pendências operacionais da audit-fix quando há evidência nova abaixo. PR de trabalho: http[caminho local omitido]

| Item | Estado atual | Evidência |
|---|---|---|
| Blob privado | Corrigido e verificado em produção | Store eventmap-media-private, iad1, privado, conectado apenas a Production. Nenhum upgrade solicitado. BLOB_READ_WRITE_TOKEN configurado. Nove imagens copiadas após dry-run, oito comparadas sem sobrescrita e avatar recuperado acrescentado. Arquivos de origem preservados. |
| Avatar novo persistente | Corrigido e verificado em produção | Upload autenticado, recarga de /Profile e leitura HTTP 200. Novo redeploy 2Gp638AVpZ8M5mMnsJUHzEeZAfY3 ficou Ready; avatar e imagem privada continuaram acessíveis. |
| Privacidade de imagem do chat | Corrigido e verificado em produção | Dois participantes leram a imagem. Anônimo e admin externo ao match foram negados. Fixture e mídia removidas depois do teste de persistência. |
| Referências legadas sem arquivo | Pendente do responsável | Cinco referências ausentes em onze referências locais auditadas. IDs e tipos abaixo. O fallback de iniciais já existente é a apresentação segura. Não foram apagadas referências reais. Recuperar arquivo ou reenviar a imagem pelo perfil correspondente. |
| Multipart agregado | Corrigido e verificado localmente | Galeria/banner compartilham contador conservador de bytes com texto UTF-8, nomes, cabeçalhos e reserva de 64 KiB. Cliente bloqueia antes de enviar, serviço antes de parser/arquivos/DB; Server Actions limitadas a 4.450.000 bytes. Chat, perfil e conexões enviam um arquivo e mantêm leitura streaming limitada no servidor. Regressões automatizadas passaram. |
| Sitemap ampliado | Corrigido e verificado em produção | Inclui comunidades dos eventos PUBLISHED e perfis públicos de ADMIN/PROMOTER com eventos publicados. Deduplica organizadores e exclui perfil sem papel de promotor. Robots e sitemap HTTP 200, nove URLs canônicas públicas, todas abriram HTTP 200 após a limpeza das fixtures. Teste de regressão passou. |
| SMTP | Pendente de mim | EMAIL_USER e EMAIL_PASS ausentes em Production. Senha de app do Gmail depende do titular. Roteiro de teste abaixo. |
| VAPID / Web Push | Corrigido e verificado na inicialização | Chaves geradas em memória, mesmos WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY e WEB_PUSH_SUBJECT na Vercel e no Render. Nenhuma chave privada exibida ou adicionada ao Git. Render [identificador omitido] Live; log External push enabled. em 05/11/2026 12:28:35 America/Sao_Paulo. Entrega push no dispositivo depende da permissão e inscrição do navegador. |
| QR web/mobile | Pendente de decisão do responsável | Mobile usa API própria em EXPO_PUBLIC_API_URL. server/independent/src/server.ts:112 assina usando CHECKIN_SIGNING_SECRET ou MOBILE_AUTH_SECRET, e o app solicita/valida pelo backend. Web usa CHECKIN_SIGNING_SECRET ou NEXTAUTH_SECRET. Nenhum segredo alterado. Para interoperabilidade, configurar o mesmo CHECKIN_SIGNING_SECRET apenas nos dois backends em mudança coordenada, considerando QR ativos. Nunca no bundle Expo. |
| E2E autenticado | Corrigido e verificado em produção | scripts/e2e-producao.mjs passou com três sessões independentes, painel /admin, catálogo, inscrição, check-in, chat entre sessões, rascunho e limpeza. Credenciais existiram só no manifesto ignorado e no processo. |
| Worker / reconexão | Corrigido e verificado em produção | Uma notificação criada para a conta temporária gerou um único sinal em 3.304 ms; sem repetição nas duas consultas seguintes (11 s). Reconexão com novo ticket passou. |
| CSP | Verificado na amostra autenticada | Home, login/retorno autenticado, mapa em #home-discovery, agenda, evento, chat, perfil e admin abriram; origens reportadas pelo listener de violações: []. Mantido Report-Only. Recomenda-se validar OAuth completo, dispositivo push e fluxos SMTP antes de considerar bloqueio. |
| Hibernação real | Não testável com a evidência disponível | A CLI não devolveu logs HTTP de requisições. Conforme documentação Render, logs HTTP públicos exigem workspace Pro ou superior: http[caminho local omitido] Ausência de linhas no Hobby não prova inatividade. Não foi contratado plano nem declarado um tempo de cold start sem evidência. Para executar essa prova no plano atual, é necessária uma execução com instrumentação sanitizada de tráfego na aplicação ou logs HTTP disponíveis. Não se deve interpretar logs vazios do Hobby como ausência de tráfego. |
| Limpeza | Corrigido e verificado em produção | Teardown removeu 3 contas, 1 evento publicado, 2 inscrições, 1 mensagem privada, 1 match, 2 perfis de participação, 1 anexo de comunidade, 1 cota e 1 histórico. O E2E base já havia removido 1 mensagem de evento, 1 rascunho e 1 inscrição; o complementar removeu 1 notificação no finally. Duas imagens de teste removidas do Blob. Segunda execução de teardown confirmou zero resíduos, inclusive sessões. Credenciais eliminadas do manifesto após limpeza. |

### Mídia irrecuperável nesta cópia

Somente identificador e tipo, sem dados pessoais:

| ID | Tipo |
|---|---|
| 093c53c7-cbd2-4613-8f16-8dbe55e3f6d1 | User.image |
| fa96d6cc-fc81-4276-9fd4-cb538e763755 | PartyUserProfile.photoUrl |
| 334a6c24-ded5-4cfe-aca1-31e71d2efc34/fa96d6cc-fc81-4276-9fd4-cb538e763755 | PartyProfile.photoUrl |
| 6984f622-5c56-48f2-b258-15162bd8454c/fa96d6cc-fc81-4276-9fd4-cb538e763755 | PartyProfile.photoUrl |
| 5a2a394c-a3fc-4d70-8b07-8b85896dbf58/fa96d6cc-fc81-4276-9fd4-cb538e763755 | PartyProfile.photoUrl |

### Roteiro SMTP após configuração do titular

1. Ativar verificação em duas etapas do Gmail, gerar senha de app e cadastrar EMAIL_USER/EMAIL_PASS como segredos em Production. Fazer redeploy.
2. Cadastrar uma conta de teste com caixa controlada, confirmar recebimento e domínio canônico do link. Confirmar uma vez e verificar que a reutilização é negada.
3. Solicitar reenvio antes da confirmação, conferir resposta genérica e entrega na caixa. Conferir limites de repetição com um único fluxo manual, sem força bruta.
4. Solicitar recuperação, usar o link uma vez, conferir expiração e revogação das sessões antigas. Fazer login com a senha nova e limpar somente a conta criada para esse teste.

### Verificação local e execução

Lint, build com 37 páginas estáticas, TypeScript do app/servidor e oito suítes exigidas passaram, além de scripts/verify-audit-followup.cjs e testes de multipart agregado. O primeiro teste de transporte local sofreu timeout no sandbox e passou com loopback autorizado. A instalação temporária de Playwright no projeto falhou por conflito de peers preexistente e ECONNRESET; o lock foi preservado, node_modules restaurado e bcrypt recuperado da cópia local da mesma versão, com hash/compare verificados. Playwright foi instalado isolado em .e2e-auditoria/tooling, sem dependência ou lock novo versionado.

Fixtures: scripts/create-e2e-fixtures.mjs exige E2E_DATABASE_URL no processo e exatamente um modo --dry-run, --apply ou --teardown. O manifesto .e2e-auditoria/fixtures.json é ignorado pelo Git. O teardown valida IDs, domínio .invalid e propriedade, recusa dados externos, usa transação com timeout limitado e consulta resíduos. Segredos nunca devem ser copiados para comandos, relatórios ou logs.

Para galerias acima do limite agregado, recomenda-se upload direto assinado com validação de autorização/tamanho e confirmação do arquivo no servidor. Não implementado nesta tarefa.


Verificação pública final da audit-followup: Vercel GV5hyPZRLxjNjHaZSxULmYPcxPgD Ready, URL canônica preservada. Cabeçalhos aprovados, nove URLs no sitemap (todas 200), sem rotas privadas. Consulta de runtime Vercel dos últimos cinco minutos devolveu zero registros de erro; a janela de uma hora foi recusada pela retenção do Hobby. Essa consulta não comprova ausência de incidentes fora da janela. Log Render de push habilitado confirmado após repetir uma falha 503 transitória do serviço de logs.
