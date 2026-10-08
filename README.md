# EventMap ? site e aplicativo mobile

Este reposit?rio cont?m os dois projetos:

- `Events-Project/`: site Next.js, Prisma, autentica??o e Socket.IO pr?prios.
- `events-project-mobile/`: aplicativo Expo/React Native e backend Node.js independente em `server/`.

As aplica??es compartilham o PostgreSQL. O backend mobile n?o importa nem inicia o projeto web; sua API e seu Socket.IO s?o atendidos pelo mesmo processo. Presen?a e notifica??es de conta entre as aplica??es utilizam o banco compartilhado.

## Site

Dentro de `Events-Project`, instale as depend?ncias com `npm ci` e configure o ambiente conforme o README dessa pasta. Use `npm run dev` para Next.js ou `npm run dev:socket` quando precisar dos recursos Socket.IO.

## Aplicativo mobile

Dentro de `events-project-mobile`:

1. Execute `npm ci` e `npm ci --prefix server`.
2. Configure `.env` e `server/.env` a partir dos respectivos exemplos. Use o mesmo banco do site e um segredo de autentica??o exclusivo do mobile.
3. Revise as migra??es em `server/independent/migrations` e o ambiente de destino antes de executar `npm run api:migrate`.
4. Execute `npm run backend` para API e Socket.IO mobile, por padr?o na porta 4100.
5. Em outro terminal, execute `npx expo start`. Login Google nativo exige uma development build; consulte `docs/ANDROID_SETUP.md`.

No celular f?sico, configure os endere?os p?blicos da API e do socket com o IP LAN do computador. No emulador Android, utilize `10.0.2.2`. Ambos devem apontar para a porta configurada no backend.

Consulte os READMEs de cada projeto e `events-project-mobile/docs/MOBILE_PROJECT_CONTEXT.md` para configura??o e limita??es.

Segredos, credenciais, depend?ncias e builds n?o s?o versionados. A exporta??o JavaScript iOS n?o substitui compila??o nativa e testes em dispositivo Apple.
