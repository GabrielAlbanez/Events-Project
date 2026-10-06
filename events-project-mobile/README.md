# EventMap Mobile

React Native + Expo SDK 57 + TypeScript. Código web preservado. A API separada reutiliza os serviços e o Prisma do site; não cria outro banco nem altera o schema.

## Organização

- `src/app/`: Expo Router, quatro tabs e stack.
- `screens/`: telas de domínio e chat nativo.
- `components/`: UI, mapa, QR, avatar, eventos e comunidade.
- `services/`: HTTP, credenciais e Socket.IO.
- `hooks/`, `context/`, `types/`, `theme/`: recursos, sessão, contratos e identidade visual.
- `server/`: API autenticada separada; consulte `server/README.md`.
- `docs/MIGRATION.md`: inventário, diferenças e validação pendente.

O site ainda está em `C:\Users\gabri\Events-Project`. A mudança física para `C:\Users\gabri\EventsApp\Events-Project` aguarda liberação dos processos que mantêm a pasta aberta. Não pare o site enquanto houver necessidade de acesso pelo túnel. Após movê-lo, recompile a API.

## Executar

No projeto mobile:

```powershell
npm install
npm --prefix server install
npm run api:build
npm run api:start
```

Em outro terminal:

```powershell
npx expo start
```

Mantenha também o servidor Socket.IO do site (`npm run dev:socket`) ou o comando público existente configurado com a URL HTTPS do túnel.

Copie `.env.example` para `.env` e informe URLs públicas. Em dispositivo físico, `localhost` aponta para o telefone: use o IP LAN do computador e porta 4000 para a API. Fora da mesma rede, a API precisa de endpoint HTTPS próprio; o túnel do site na porta 3000 não publica automaticamente a API na porta 4000. Reinicie Expo após alterar variáveis públicas.

A API usa os segredos do ambiente servidor e do web. Nunca coloque DATABASE_URL, NEXTAUTH_SECRET ou client secret em EXPO_PUBLIC. Credenciais nativas ficam no SecureStore; o preview web usa memória e não persiste login.

## Integrações que exigem configuração

- Google nativo: IDs OAuth por plataforma, package/bundle e assinatura Android, mais `GOOGLE_NATIVE_CLIENT_IDS` no servidor. Não reutilize indiscriminadamente o client web. Use development build para validar callback nativo. Sem configuração, o botão informa a indisponibilidade.
- Mapas Android/iOS: chaves restritas por plataforma na configuração Expo; exigem recompilar o binário. O preview web mostra fallback e não simula Google Maps nativo.
- Câmera/galeria/localização: permissões nativas; validar em aparelho.
- Socket.IO nativo usa o mesmo servidor do site e a sessão NextAuth validada no servidor. No preview web, usa atualização HTTP periódica, pois o navegador não permite enviar o cookie nativo no handshake.
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

Os testes da API usam isolamento e não criam contas, eventos nem migrações no banco compartilhado. Exportar bundles confirma compilação, não confirma todos os fluxos em dispositivos.

O projeto mobile não tem destino Git definido. Não publique seus arquivos no repositório web por engano. `.env`, armazenamento privado e artefatos gerados ficam fora de versionamento.
