# Perfil único de conexões

## Como usar

1. Abra **Minha conta → Perfil de conexões**, ou a aba **Meu perfil** nas conexões de um evento.
2. Revise foto, nome de exibição, apresentação, interesses e intenção. Esse perfil é separado do perfil público da conta.
3. Salve. Isso não faz inscrição, não ativa eventos nem altera sua foto pública.
4. Em cada evento com presença confirmada, escolha **Participar das conexões**. Não é necessário preencher os dados novamente.
5. Para sair, use **Sair da descoberta** naquele evento. O perfil único e as outras participações permanecem salvos. Os matches/conversas do evento encerrado ficam indisponíveis conforme as regras anteriores.

Alterações confirmadas no perfil único atualizam suas informações nas participações existentes, mantendo cada estado ativo/inativo. Mudanças de intenção continuam sujeitas à compatibilidade e à declaração de maioridade; bloqueios e revogações não são contornados.

## Preservação dos perfis anteriores

A migração `20261031150000_party_user_profile` cria `PartyUserProfile` por usuário e usa seu perfil de evento mais recente como base privada, com `needsReview=true`. Empates usam o ID do evento como critério estável. Não modifica `PartyProfile`, curtidas, matches, mensagens ou ativações existentes.

Antes de entrar em outro evento, a pessoa precisa revisar e salvar a base. As participações antigas continuam funcionando até essa confirmação, com os dados que já estavam autorizados. Guardar a revisão atualiza os dados compartilhados sem mudar os consentimentos de participação.

`PartyProfile` permanece como materialização por evento para preservar as verificações existentes de acesso e integração. Não é um segundo formulário no site. As novas edições do site têm `PartyUserProfile` como fonte. O aplicativo e seu servidor independente não foram modificados nesta entrega; o fluxo visual deles será atualizado separadamente.

## Contratos

| Operação | Efeito |
| --- | --- |
| `GET /api/party-profile` | Perfil da conta autenticada e `needsReview`; não cria registros nem ativa participação. |
| `PUT /api/party-profile` | Recebe apenas os campos do perfil, sem `action`, `userId` ou evento. Confirma a revisão e atualiza as materializações existentes sem mudar `active`. |
| `GET /api/party-connections/[eventId]` | Acrescenta `savedProfile` e `profileNeedsReview`; `mine` continua representando a participação daquele evento. |
| `POST ... {action:"profile.join"}` | Exige inscrição confirmada/check-in e perfil único revisado; ativa somente aquele evento. |
| `POST ... {action:"profile.leave"}` | Sai somente do evento; não apaga o perfil único nem outras participações. |
| `profile.save` legado | Mantido para compatibilidade como salvar perfil global e entrar explicitamente no evento. O novo frontend usa PUT e join separados. |

As rotas autenticam no servidor, validam origem/tamanho/campos, não aceitam ID de outra conta e não permitem cache público. Saves e joins do mesmo usuário são serializados. Transações têm limites explícitos de espera e execução; respostas interrompidas devem ser conferidas antes de reenviar.

Atualizações emitem invalidações em lote para eventos, matches e contas afetadas. O cliente consulta o estado autorizado por HTTP; o sinal não transporta dados do perfil ou mensagens. Conteúdo incompatível ou revogado continua indisponível.

Fotos de conexões não substituem `User.image`. URLs privadas novas só são aceitas quando a mídia pertence à conta; referências próprias antigas podem ser mantidas. Acesso de terceiros continua dependendo das regras do evento/par. A limpeza de uploads considera o perfil único para não excluir uma foto salva antes da participação.

## Validação

```bash
npx tsc --noEmit --incremental false
npx tsc --project tsconfig.server.json --noEmit
npm run lint
npm run build
npm run test:party-connections
```

`scripts/verify-party-global-profile.cjs` não escreve por padrão. Para uma base de testes isolada e migrada, carregue suas variáveis de ambiente de forma segura e defina `PARTY_GLOBAL_PROFILE_DB_TEST=isolated-fixtures`. Para também testar login Credentials, rotas e Socket.IO reais, inicie o servidor conjunto usando a mesma base e defina `PARTY_GLOBAL_PROFILE_HTTP_URL=http://localhost:3100` (ou sua porta local).

O teste cria somente fixtures novas e limpa seus próprios IDs. Não o execute em produção. Ele cobre backfill limitado à fixture, participação por evento, revisão, isolamento, concorrência, autenticação, origem, cache, mídia privada e entrega de invalidação por WebSocket quando o modo HTTP está habilitado. Harnesses de frontend não substituem esses testes de integração.
