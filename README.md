# EventMap — site e aplicativo mobile

Este repositório contém os dois projetos:

- `Events-Project/`: site Next.js, Prisma, autenticação e servidor Socket.IO.
- `events-project-mobile/`: aplicativo Expo/React Native e API mobile em `server/`.

## Site

Execute dentro de `Events-Project`: `npm ci`, configure o ambiente conforme a documentação existente, execute `npm run prisma:generate` e `npm run dev:socket`.

## Aplicativo mobile

Execute dentro de `events-project-mobile`: `npm ci`, copie `.env.example` para `.env` e configure os endereços acessíveis ao dispositivo. Instale também a API com `npm ci --prefix server`.

Com as dependências e o ambiente do site configurados, execute `npm run api:build`, `npm run api:start` e, em outro terminal, `npx expo start`. A API detecta automaticamente a pasta irmã `Events-Project`; `WEB_PROJECT_PATH` permite indicar outro caminho.

Consulte `events-project-mobile/docs/ANDROID_SETUP.md` e `events-project-mobile/docs/MIGRATION.md` para Google, Maps, ambiente Android, funcionalidades e limitações.

Segredos, credenciais, dependências e builds não são versionados. A exportação iOS não substitui testes e compilação em macOS/dispositivo Apple. O banco e o Socket.IO são compartilhados; não execute migrações sem revisar o ambiente de destino.
