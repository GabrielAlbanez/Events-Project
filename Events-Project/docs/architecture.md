# Arquitetura do EventMap

## Responsabilidades

- **app/**: páginas, handlers HTTP e server actions. As actions de eventos e engajamento preservam os contratos usados pelos componentes e passam a autenticação aos serviços.
- **lib/services/**: casos de uso de eventos, favoritos/lembretes, notificações, promotores/resultados, cadastro, credenciais, perfil e administração de usuários. Aqui ficam regras, autorização por recurso e transações.
- **lib/community/**: casos de uso e consultas da comunidade e das salas privadas. Os serviços recebem uma identidade, verificam acesso ao recurso e persistem mudanças e sinais na mesma transação. Os adaptadores HTTP ficam em `app/api/community/`.
- **schemas/**: validação dos dados recebidos, antes da persistência.
- **lib/eventQueries.ts**: projeções públicas explícitas. Nunca substituir por inclusão completa de User.
- **lib/storage/**: arquivos de imagens. A limpeza após falha acontece no serviço que iniciou a operação.
- **lib/adminAuth.ts**: adaptação da sessão NextAuth para identidade verificada no banco.
- **lib/authPolicy.ts**: regras de acesso às rotas e bloqueio da identidade de desenvolvimento. Não importa Prisma ou APIs HTTP.
- **lib/auth/options.ts**: configuração NextAuth, separada do handler HTTP.
- **lib/mail/**: transporte de mensagens de verificação.
- **server/**: processamento assíncrono de lembretes e notificações; server.mts monta HTTP e Socket.IO.
- **components/**: apresentação e interação. Acesso ao banco permanece no servidor.

## Direção das dependências

Actions → serviços → consultas/Prisma/armazenamento.

O serviço recebe ResolveCurrentUser: a action fornece a implementação NextAuth; os testes fornecem a identidade de teste. O serviço não conhece headers, cookies ou redirecionamentos. Prisma continua como infraestrutura concreta, com transações explícitas; não há interfaces que apenas repitam cada método do ORM.

## Comunidade em tempo real

Uma ação HTTP validada chama o caso de uso. O caso de uso grava a mudança e um `CommunitySignal` na mesma transação. O worker lê somente sinais pendentes; o gateway verifica novamente se cada conexão pode acessar a sala e emite uma invalidação sem dados privados. O cliente busca um snapshot pela API. O Socket.IO não aceita alterações de domínio enviadas diretamente pelo navegador.

Os contratos ficam em `types/community.ts`, as entradas em `schemas/community.ts` e os componentes de apresentação em `Community*.tsx`. Regras de acesso, persistência, entrega e apresentação têm responsabilidades distintas. O navegador limpa os dados ao trocar de identidade ou perder acesso; reconectar exige uma leitura nova do servidor.

A confirmação do worker indica que ele emitiu o aviso, não que um navegador o recebeu. Os dados persistidos, a leitura após reconexão e a atualização periódica recuperam mudanças perdidas. A entrega atual pressupõe um único servidor Socket.IO; múltiplas instâncias exigem adapter/pubsub e controle por consumidor.

## Como evoluir

1. Mantenha as actions pequenas e compatíveis com seus consumidores.
2. Coloque novas regras no serviço correspondente e validação em schemas.
3. Preserve a checagem de propriedade e papel dentro do serviço, mesmo quando a rota usa middleware.
4. Faça operações relacionadas na mesma transação e remova arquivos somente após confirmar a operação apropriada.
5. Use projeções públicas para dados enviados ao visitante.
6. Verifique lint, TypeScript, build e os testes de fluxo ao alterar regras.

## Limite atual

A separação foi aplicada ao núcleo de eventos e engajamento. Os handlers legados de recuperação de senha e verificação de e-mail ainda mantêm sua organização anterior. O projeto não usa uma arquitetura hexagonal completa; a separação atual mantém a estrutura Next.js e reduz o acoplamento aos transportes sem adicionar dependências.

## Validação

npm run lint
npx tsc --noEmit --incremental false
npx tsc --project tsconfig.server.json
npm run build
npm run test:features
npm run test:features:db
npm run test:community
npm run test:community:db

O teste de banco cria dados temporários e faz limpeza ao finalizar. Execute em banco de desenvolvimento. Para validação HTTP e Socket.IO com servidor em execução, use npm run test:features:http.
