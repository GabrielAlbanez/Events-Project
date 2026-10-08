# Contexto do app mobile EventMap

## Arquitetura

- `events-project-mobile/` é o frontend Expo/React Native.
- `events-project-mobile/server/` é a API Node independente. Rode API e Expo em
  terminais separados; a API não inicia o Metro.
- `Events-Project/` é o frontend Next.js e seu servidor Socket.IO.
- Web e mobile compartilham somente PostgreSQL. A API mobile não importa código
  do projeto Web.
- Não altere arquivos `.env`, não registre credenciais e nunca exponha
  `DATABASE_URL`, `MOBILE_AUTH_SECRET` ou client secrets em `EXPO_PUBLIC_*`.

## Execução local

Em terminais separados:

```powershell
# API mobile
Set-Location C:\Users\gabri\EventsApp\events-project-mobile
npm run api:dev

# Web com Socket.IO e notificações realtime
Set-Location C:\Users\gabri\EventsApp\Events-Project
npm run dev:socket

# Expo development client
Set-Location C:\Users\gabri\EventsApp\events-project-mobile
npm run start:dev
```

Antes de iniciar os serviços pela primeira vez ou depois de adicionar migration,
aplique o schema no banco:

```powershell
Set-Location C:\Users\gabri\EventsApp\events-project-mobile
npm run api:migrate
```

Para um dispositivo Android físico, `EXPO_PUBLIC_API_URL` e
`EXPO_PUBLIC_SOCKET_URL` precisam usar um host LAN acessível pelo dispositivo;
Expo Web pode usar `EXPO_PUBLIC_WEB_URL`. Não fixe o IP em código. O emulador
Android pode usar `http://10.0.2.2:4100`.

## Sessões e presença

- A API mobile autentica por bearer token próprio; Socket.IO recebe o token em
  `handshake.auth.token`. Suspensão, exclusão e alteração de credenciais ainda
  revogam sessões.
- Alteração de função não deve incrementar `sessionVersion`: ela notifica pelo
  canal PostgreSQL `eventmap_user_role_updated`. A Web e a API verificam a
  função atual no banco antes de atualizar as conexões ativas; clientes
  atualizam a sessão sem relogar.
- A presença Web/mobile fica na tabela `RealtimePresenceSnapshot`. Cada processo
  publica a lista de IDs autenticados e renova um heartbeat; o mobile consulta
  os snapshots ao pedir usuários online. Heartbeats expiram após 15 segundos e
  linhas antigas são limpas. A migration é
  `server/independent/migrations/0002-realtime-presence.sql`.
- A tela administrativa do mobile atualiza a lista de presença ao abrir,
  reconectar e a cada 15 segundos.

## Fotos de perfil

- `User.image` é a referência compartilhada no banco. Uploads do mobile gravam
  mídia e URL pública versionada na mesma transação; uploads da Web preservam o
  caminho legado `/uploads/...`.
- O canal PostgreSQL `eventmap_profile_image_updated` entrega invalidações
  somente às sessões autenticadas do respectivo usuário.
- O mobile exibe a URL versionada retornada pelo upload imediatamente e depois
  confirma a sessão com `/me`. Isso evita esperar outra autenticação e evita
  cache antigo.
- Imagens Web legadas são encaminhadas pelo proxy restrito da API; não substitua
  o destino por uma URL fornecida pelo cliente.

## Login Google

- O app nativo usa `@react-native-google-signin/google-signin` e envia o
  `idToken` para `/v1/auth/google`. O servidor valida assinatura, email e
  audiência usando `GOOGLE_NATIVE_CLIENT_IDS`.
- O `webClientId` do app precisa estar entre as audiências configuradas no
  servidor. Os client IDs Android/iOS são credenciais OAuth públicas; não use
  client secrets no app.
- Android precisa de cliente OAuth com package `com.eventmap.mobile` e SHA-1
  correspondente ao certificado da development build ou release. iOS precisa de
  `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, bundle compatível e URL scheme derivado
  desse ID no config plugin.
- O módulo nativo não funciona no Expo Go: instale/recompile uma development
  build depois de alterar plugin, package, scheme ou configuração nativa. O
  `GoogleSignin.hasPlayServices` é chamado apenas no Android.
- O ambiente local verificado tem IDs Google Android/Web preenchidos e o
  servidor aceita o Web client como audiência. O iOS local ainda não tem client
  ID configurado.

## Verificação executada

- Testes focados da API cobrem alteração de função sem revogação, publicação
  PostgreSQL, entrega realtime por usuário, mídia e presença agregada.
- Typecheck da API, do Expo e do servidor Socket.IO Web devem passar antes de
  publicar alterações.
- OAuth e status visual em dois dispositivos/sessões precisam de uma
  development build e conta de teste reais; não considere o fluxo Google
  validado só por testes unitários.

## Arquivos relevantes

- `context/SessionContext.tsx`: estado de autenticação e tratamento de eventos
  realtime no app.
- `hooks/useGoogleSignIn.native.ts`: autenticação Google para builds nativas.
- `server/independent/src/auth-service.ts`: verificação de sessão e usuário.
- `server/independent/src/admin-service.ts`: mudanças administrativas, inclusive
  função e publicação do evento PostgreSQL.
- `server/independent/src/realtime-transport.ts`: autorização e transporte
  Socket.IO da API.
- `server/independent/src/realtime-presence.ts`: heartbeat agregado no banco.
- `server/independent/src/profile-image-notifications.ts`: listener PostgreSQL
  de atualização da conta.
- `screens/NativeScreen.tsx`: perfil e tela administrativa de usuários.
- No projeto Web, `server/databasePresence.mts`,
  `server/profileImageRealtime.mts`, `server/socketIdentity.mts` e
  `context/SocketContext.tsx` integram a presença, as fotos e as mudanças de
  função.
