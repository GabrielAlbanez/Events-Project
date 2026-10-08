# API mobile independente

Na raiz de `events-project-mobile`, configure `server/.env` com
`DATABASE_URL`, `MOBILE_AUTH_SECRET` (32 bytes ou mais), credenciais Google e,
opcionalmente, e-mail. Nunca exponha essas variáveis ao Expo.

Antes do primeiro uso, aplique uma vez a migração do banco:

```powershell
npm run api:migrate
```

Essa operação precisa de uma role PostgreSQL com DDL; a role da API em runtime
não precisa criar tabelas.

Inicie os processos separadamente, em terminais próprios:

```powershell
npm run api:dev
```

```powershell
npx expo start
```

`api:dev` compila e executa apenas a API independente na porta 4100. Expo inicia
apenas Metro. Alternativamente, inicie ambos com a tarefa VS Code correspondente;
ela mantém terminais separados. `npm run api:start` inicia apenas a build já
compilada e pode ser usado em produção. O endpoint `/health` confirma o processo,
não o banco ou integrações.

Defina `EXPO_PUBLIC_API_URL` e `EXPO_PUBLIC_SOCKET_URL` com o host do backend.
Use o IP LAN do computador em dispositivo físico; o script Android configura
`10.0.2.2:4100` para o emulador. `EXPO_PUBLIC_WEB_URL` é opcional e usado somente
para criar links de compartilhamento; autenticação, mídia, calendário e realtime
usam a API independente.

Para sincronizar avatares entre Web e app, configure `MOBILE_API_PUBLIC_URL`,
`MOBILE_WEB_MEDIA_ORIGIN` e as origens browser necessárias em
`MOBILE_API_BROWSER_ORIGINS` no `server/.env`. Os detalhes do proxy legado e dos
endereços de desenvolvimento/produção estão em [server/README.md](../server/README.md).
Se `DATABASE_URL` usar PgBouncer em modo transaction, configure
`MOBILE_DATABASE_LISTEN_URL` com uma conexão PostgreSQL direta para as
notificações realtime.

A API mobile usa `pg` diretamente e não importa, compila, inicia ou lê arquivos
de `Events-Project`. O banco PostgreSQL é o único componente de backend
compartilhado. A API do site permanece separada.

Mais detalhes, migração de imagens, rotas, configuração Google e comandos de
validação estão em [server/README.md](../server/README.md).
