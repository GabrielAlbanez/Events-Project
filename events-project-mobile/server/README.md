# EventMap Mobile API

Backend Node.js independente para o app Expo. Não importa Next.js, NextAuth,
Prisma nem arquivos de `Events-Project`; compartilha com a Web somente as tabelas
do PostgreSQL por meio de `DATABASE_URL`.

## Desenvolvimento local

1. Execute `npm install` na raiz mobile e `npm --prefix server install`.
2. Copie `server/.env.example` para `server/.env` e configure `DATABASE_URL`,
   `MOBILE_AUTH_SECRET` (mínimo de 32 bytes), os client IDs Google e, se usar
   e-mail, `EMAIL_USER`/`EMAIL_PASS`.
3. Aplique todas as migrations da API com `npm run api:migrate`. Isso inclui o
   schema auxiliar de presença compartilhada entre Web e mobile. A role usada
   nesta etapa precisa de DDL; a role do servidor em execução não precisa.
4. Em um terminal, execute `npm run api:dev`. Em outro, `npx expo start`.
   Para iniciar apenas um artefato previamente compilado, use `npm run api:start`.
5. A API escuta `MOBILE_API_HOST` e `MOBILE_API_PORT` (padrão do exemplo:
   `0.0.0.0:4100`). O Expo usa `EXPO_PUBLIC_API_URL` e
   `EXPO_PUBLIC_SOCKET_URL`; em dispositivo físico informe o IP LAN do computador,
   e no emulador Android use `http://10.0.2.2:4100`.

Os dois processos são independentes: o servidor não inicia o Metro/Expo e o Expo
não inicia o servidor. `/health` atesta somente que o processo HTTP está ativo,
não a conexão com o banco ou os serviços Google/e-mail.

## Banco e mídia

`server/independent/migrations/0001-mobile-owned-media.sql` cria as tabelas de
mídia de eventos e conversas privadas. A migração pode ser reaplicada e é
executada explicitamente, não durante requisições. O servidor não escreve nem
remove arquivos do projeto Web.

Para migrar imagens legadas, configure o acesso aprovado ao banco e ao diretório
de origem e rode primeiro os importadores em modo dry-run:

- `node server/independent/scripts/import-referenced-media.mjs`
- `node server/scripts/import-legacy-chat-images.mjs --source <diretório>`

Só use `--apply` depois de revisar os resultados, obter autorização e confirmar
backup. O importador privado exige que a migração SQL já tenha sido aplicada.
Links relativos de mídia atendidos pelo app apontam para a API independente.

### Fotos de perfil Web e app

`User.image` guarda a URL absoluta e versionada da API para fotos enviadas pelo
app (`MOBILE_API_PUBLIC_URL/v1/media/profile/<id>`). A Web pode carregar essa
URL diretamente; cada novo upload gera um ID distinto para invalidar o cache.
Após a transação, a API publica uma notificação PostgreSQL para que o servidor
Socket.IO da Web e os clientes mobile autenticados atualizem a sessão em tempo
real. A foto continua sendo resolvida pelo valor atual de `User.image`.
Quando uma função (`BASIC`, `PROMOTER` ou `ADMIN`) é alterada pela API mobile,
a notificação PostgreSQL atualiza as sessões Web e mobile sem invalidar a
credencial ativa. Suspensões, exclusões e alterações de credenciais continuam
revogando sessões conforme as regras de segurança.
O backend Web e a API mobile mantêm conexões PostgreSQL dedicadas para
`LISTEN/NOTIFY`; configure `DATABASE_LISTEN_URL` no Web ou
`MOBILE_DATABASE_LISTEN_URL` na API se o respectivo `DATABASE_URL` usar
pooling em modo transaction. Essas URLs não são expostas ao Expo. Em
desenvolvimento e produção, inicie a Web pelo servidor com Socket.IO
(`npm run dev:socket` ou `npm run start:socket`), não apenas pelo processo
Next.js sem Socket.IO.
Fotos legadas da Web permanecem no formato `/uploads/<arquivo>`: o app as
resolve por um proxy restrito da API, que só aceita nomes de arquivo no padrão
UUID ou `timestamp-uploaded_image` e busca `MOBILE_WEB_MEDIA_ORIGIN/api/media/`.
O proxy não aceita host, caminho ou redirecionamento fornecidos pelo cliente.

Configure `MOBILE_API_PUBLIC_URL` como a origem HTTPS pública da API (sem
caminho) e `MOBILE_WEB_MEDIA_ORIGIN` como a origem HTTPS pública da Web. Em
desenvolvimento, use as origens locais acessíveis tanto pela Web quanto pelo
dispositivo/emulador. `MOBILE_API_PUBLIC_URL` precisa ser alcançável pelo
navegador Web; para uploads no app, use nele o mesmo host acessível ao dispositivo.
Inclua também a origem Web em `MOBILE_API_BROWSER_ORIGINS` quando o navegador
precisar fazer chamadas cross-origin à API.
Se essas variáveis não estiverem configuradas, a API mantém-se ativa, mas não
aceita novos uploads de avatar ou não consegue servir fotos legadas,
respectivamente.

## Contrato e autenticação

As rotas versionadas e seus métodos ficam em `independent/src/http-server.ts`;
administração e impersonação são despachadas por `independent/src/admin-routes.ts`.
O backend cobre autenticação Google/credenciais, cadastro e recuperação, perfil,
eventos/leitura/autoria, uploads e mídia, favoritos/lembretes/notificações,
inscrições/check-in/denúncias, métricas/histórico de promotor, administração,
comunidade, chat, conexões privadas e Socket.IO.

As sessões mobile são bearer JWT próprios, revogáveis por suspensão e
`sessionVersion`; não são cookies NextAuth. Google ID tokens são verificados no
servidor contra `GOOGLE_NATIVE_CLIENT_IDS`, e emails coincidentes não vinculam
contas existentes automaticamente. O app usa o SDK nativo Google em development
build; cadastre client IDs, bundle/package e SHA-1 conforme a configuração OAuth
da aplicação. Nunca inclua client secrets, `DATABASE_URL` ou
`MOBILE_AUTH_SECRET` em variáveis `EXPO_PUBLIC_*`.

Socket.IO usa o mesmo host da API independente e autentica o token via
`handshake.auth.token`. No Expo Web o cliente não abre essa conexão nativa; os
recursos continuam disponíveis pelas chamadas HTTP.

## Verificações

Na raiz mobile:

```powershell
npm run api:typecheck
npm run api:build
npm run api:test
npm run typecheck
npm run lint
npm run test:client
npm run build
```

Os testes automatizados não usam o banco configurado. A integração real exige
aplicar a migração e validar acesso ao PostgreSQL, login Google, e-mail, uploads,
Socket.IO e fluxos autenticados em um development build.
