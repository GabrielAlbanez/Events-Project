# EventMap Native API (server-only)

Este pacote compila um adaptador HTTP separado reutilizando os serviços, handlers,
validação e cliente Prisma do projeto web. Não modifica o código web nem executa
migrações. Os dados PostgreSQL são os mesmos. Execute em Node 22+.

## Configuração

1. Instale as dependências do web e gere seu Prisma client pelo fluxo existente.
2. Neste diretório: `npm install`, `npm run typecheck`, `npm run build`, `npm start`.
3. `WEB_PROJECT_PATH` aponta para o web em `../../Events-Project` ou
   `C:/Users/gabri/Events-Project`; ambos são detectados. O build grava o caminho no
   pacote compilado; ao mover o web, compile novamente.
4. Segredos vêm do ambiente do processo, `server/.env`, web `.env.local` ou web
   `.env`, nessa prioridade. Nunca coloque DATABASE_URL/NEXTAUTH_SECRET/credenciais
   Google nas variáveis EXPO_PUBLIC. `.env` não é criado automaticamente.
5. Configure `NATIVE_API_PORT` (4000), `NATIVE_API_HOST` (127.0.0.1; para dispositivo
   físico use 0.0.0.0 e uma rede confiável). Produção exige HTTPS no proxy externo.
6. `NATIVE_BROWSER_ORIGINS` aceita origens explícitas separadas por vírgula para
   Expo Web. Não é necessário para iOS/Android. Sem wildcard/cookies de navegador.

O servidor usa o diretório de trabalho web para os uploads existentes: imagens
públicas em `public/uploads` e privadas em `.private-uploads/chat`. São dados de
runtime compartilhados, sem alteração no código web. Acesso a imagens privadas
continua exigindo participante autorizado. `/uploads/:filename`, `/api/media/:filename`
e `/v1/media/:filename` reaproveitam a validação pública de mídia. Não publicar a
pasta privada. Dois servidores em máquinas diferentes precisam montar o mesmo
armazenamento; não copiar ou duplicar imagens silenciosamente.

## Contrato

Base `/v1`. Sucesso `{data:T}`; erro `{message:string}` com código HTTP apropriado.
JSON é limitado a 16KB; upload a 6MB; formulário evento a 56MB (capa + até dez
imagens, cada uma até 5MB conforme serviço existente). Limite por endereço e
limite separado de autenticação. Não confia em cabeçalhos de identidade/proxy.

- POST `/auth/login`: `{email,password}`; POST `/auth/google`: `{idToken}`.
  Retorno `{token,expiresAt,user:{id,name,email,image,role,emailVerified,provider}}`.
- POST `/auth/register`: `{name,email,password}`. GET `/auth/verify?token=...`.
- POST `/auth/recovery`, `/auth/resend-verification`: `{email}`.
- POST `/auth/reset-password`: schema web `schemas/passwordRecovery.ts`.
- GET `/me`, GET `/profile`, PATCH `/profile`: `{email,name?,password?,newPassword?}`.
- POST `/upload`: multipart `file`, opcional `?purpose=party`; identidade adicionada
  pelo servidor; retorno `{url}`.
- GET `/events`, `/events/mine`, `/events/:id`.
- POST `/events?submit=true|false`, PUT `/events/:id?submit=true|false`: multipart
  `nome,descricao,endereco,linkParaCompra,dataInicio,dataFim,category,priceCents,
  isFree,capacity,lat,lng,startTime,endTime`, arquivo `banner`, arquivos `carrossel`.
- POST `/events/:id/duplicate`, `/events/:id/cancel`, `/events/:id/recurrence`
  (`{frequency,interval,count}` conforme schema web).
- GET `/favorites`, GET/POST `/events/:id/favorite`, PUT `/events/:id/reminder`
  (`{minutes:number|null}`). GET `/notifications?before=...&unread=true` retorna
  `{items,nextBefore}`. PATCH `/notifications/:id/read`, `/notifications/read-all`.
- GET `/promoters/:id`, POST `/promoters/:id/follow`, GET/PUT `/promoter/profile`
  (`{bio,contactUrl}`), GET `/promoter/stats`.
- GET `/history`, `/events/:id/history` retorna `{status,history}`.
- GET `/admin/users?page=1&q=...&role=...` retorna `{status,data,pagination,counts}`.
  PATCH `/admin/users/:id/role` `{role}`; DELETE `/admin/users/:id`.
- GET `/admin/events`; POST `/admin/events/validate` `{ids:string[]}`;
  DELETE `/admin/events` `{ids:string[]}`; POST `/admin/events/:id/correction`
  `{reason}`.
- Os handlers web seguintes são reutilizados com os mesmos métodos, payloads e
  respostas de domínio, dentro de `data`: `/events/:id/registration`,
  `/events/:id/check-in-token`, `/events/:id/check-in`, `/events/:id/reports`,
  `/event-calendar/:id` (binário), `/event-engagement/:id`, `/community/events/:eventId`,
  `/community/rooms`, `/community/rooms/:roomId`, `/community/activity`,
  `/event-chat/:eventId`, `/party-connections/:eventId`,
  `/party-connections/:eventId/matches/:matchId` e `/images`, `/images/:imageId`,
  `/admin/users/:id/events`, `/admin/users/:id/suspension`, `/admin/reports`,
  `/admin/reports/:id`, `/admin/party-reports`.
  `src/routes.ts` define a lista explícita; métodos não existentes retornam 405.

## Sessão e Google

Use `Authorization: Bearer <token>`; o servidor emite JWE NextAuth com o MESMO
NEXTAUTH_SECRET e verifica conta atual, suspensão, sessionVersion, stamp da senha,
expiração e bloqueio por impersonação em cada solicitação. Senha/roles do cliente
não são usados como identidade. Senha alterada, remoção e suspensão revogam acesso.
Logout nativo deve apagar o token no SecureStore; não existe refresh endpoint.

Google usa `google-auth-library` oficial e verifica assinatura, emissor, audience,
expiração e email verificado. Configure `GOOGLE_NATIVE_CLIENT_IDS` no servidor com
os OAuth client IDs autorizados (separados por vírgula). Configure o cliente Expo
com os IDs públicos correspondentes e callback/deep link registrados no Google
Cloud (bundle iOS, package Android e SHA-1). O app obtém ID token por OAuth com PKCE
ou SDK Google e envia apenas esse token ao servidor. Não incluir client secret no
app. Sem IDs configurados a API retorna 503 explícito. Email igual não vincula
contas existentes automaticamente: use seu método original. Contas Google novas
são criadas pela transação de usuário+account do mesmo Prisma, sem migração.

Socket.IO continua no servidor web existente. Native iOS/Android conecta com
`extraHeaders.Cookie = 'next-auth.session-token=<token>; __Secure-next-auth.session-token=<token>'`
e `transports:['websocket']`. Usa os mesmos canais/protocolos, autorização e workers.
Tokens não são enviados em URLs. Web preview não pode definir Cookie em handshake;
precisa sessão web existente ou relay autenticado configurado explicitamente.

Admin impersonação: POST `/admin/impersonation/start` `{userId,reason}`, POST `/admin/impersonation/end` `{}` retornam a mesma estrutura de login. Mantém id/provider/stamp/sessionVersion do administrador original, apenas troca impersonationId. `user.impersonation` inclui `{id,adminId,adminName,userName,expiresAt}`. GET `/admin/impersonation/status` retorna `{blocked,impersonation,restoreRequired,session?}`; a sessão restaurada é fornecida após expiração/encerramento. GET `/admin/impersonation/audit` mantém auditoria existente. POST `/auth/logout` encerra o registro auditado antes de apagar o token local. Não estende a expiração original durante a troca.
Push de navegador não equivale a Expo push; inscrições web não são reutilizadas
como tokens de notificação nativa. Email/Google/mapas/banco/socket dependem das
configurações reais; o health endpoint confirma processo, sem simular integrações.
