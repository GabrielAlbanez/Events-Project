# EventMap Mobile

React Native + Expo SDK 57 + TypeScript. O frontend e o backend mobile são
independentes do projeto Web e compartilham somente o banco PostgreSQL.

## Organização

- `src/app/`: Expo Router, quatro tabs e stack.
- `screens/`: telas de domínio e chat nativo.
- `components/`: UI, mapa, QR, avatar, eventos e comunidade.
- `services/`: HTTP, credenciais e Socket.IO.
- `hooks/`, `context/`, `types/`, `theme/`: recursos, sessão, contratos e identidade visual.
- `server/`: API independente em Node.js + PostgreSQL; consulte `server/README.md`.

Para contexto técnico de sessões, presença, fotos compartilhadas e login Google,
consulte [`docs/MOBILE_PROJECT_CONTEXT.md`](./docs/MOBILE_PROJECT_CONTEXT.md).

## Executar

No projeto mobile:

```powershell
npm install
npm --prefix server install
npm run api:migrate
npm run api:dev
```

Em outro terminal:

```powershell
npx expo start
```

Configure `server/.env` a partir de `server/.env.example` com o banco, segredo
mobile, IDs OAuth e credenciais de e-mail. Configure `.env` do Expo com os URLs
públicos; use a porta 4100 e o IP LAN do computador no dispositivo físico. O
Socket.IO também é atendido pela API independente. Reinicie o Expo após alterar
as variáveis públicas.

A API não lê configurações ou arquivos do site. Nunca coloque `DATABASE_URL`,
`MOBILE_AUTH_SECRET` ou client secret em `EXPO_PUBLIC`. Credenciais nativas ficam
no SecureStore; o preview web usa memória e não persiste login.

## Integrações que exigem configuração

- Google nativo: o fluxo Android/iOS usa `@react-native-google-signin/google-signin` com config plugin e exige development build (não funciona no Expo Go). Configure client IDs OAuth, package/bundle, SHA-1 do certificado Android e `GOOGLE_NATIVE_CLIENT_IDS` no servidor; a audiência web do token precisa constar na API. O client ID iOS e o scheme correspondente são necessários no iOS. Não reutilize client IDs ou client secrets indiscriminadamente.
- Presença online Web/mobile: ambos publicam snapshots autenticados em `RealtimePresenceSnapshot` no PostgreSQL compartilhado. Execute `npm run api:migrate` antes de iniciar os servidores; entradas antigas expiram automaticamente se um processo terminar abruptamente.
- Mapas Android/iOS: chaves restritas por plataforma na configuração Expo; exigem recompilar o binário. O preview web mostra fallback e não simula Google Maps nativo.
- Câmera/galeria/localização: permissões nativas; validar em aparelho.
- Socket.IO nativo usa a API mobile e seu token bearer; no Expo Web a atualização é HTTP.
- Push do navegador não equivale a push nativo. Registro de notificações Expo/APNs/FCM não foi implementado.
- Cloudflare: URL temporária muda ao recriar quick tunnel. URL fixa em túnel nomeado exige domínio próprio; alternativa depende de conta/serviço autorizado. Google OAuth web exige cadastrar a URI de callback exata do endereço usado.

## Verificar

```powershell
npm run typecheck
npm run lint
npm run test:client
npm run api:typecheck
npm run api:build
npm run api:test
npm run build
npx expo-doctor
```

Os testes da API usam isolamento e não criam contas, eventos nem migrações no banco compartilhado. Exportar bundles confirma compilação, não confirma integrações reais nem fluxos em dispositivos.

O projeto mobile não tem destino Git definido. Não publique seus arquivos no repositório web por engano. `.env`, armazenamento privado e artefatos gerados ficam fora de versionamento.
