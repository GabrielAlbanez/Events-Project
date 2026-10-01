This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Para iniciar o Next.js e o Socket.IO juntos:

```bash
npm install
npm run prisma:generate
npm run dev:socket
```

Gere o cliente Prisma na configuração inicial e depois de alterar `prisma/schema.prisma`,
sempre com os servidores do projeto parados. No Windows, gerar o cliente enquanto
o servidor usa a DLL do Prisma pode causar `EPERM`.

`npm run dev:socket` compila `server.mts` e inicia o servidor sem o
loader experimental do ts-node e sem substituir a DLL do Prisma. Configure `DATABASE_URL` no `.env` para os recursos
que usam banco de dados. `npm run dev:socket` abre `http://localhost:3000`.
O tempo real usa a mesma origem do Next.js. Configure `SOCKET_IO_ALLOWED_ORIGINS`
com a origem pública da aplicação (ou várias origens separadas por vírgula).
Para autenticar conexões Socket.IO, configure também `NEXTAUTH_SECRET` e inicie
pelo servidor conjunto com `npm run dev:socket`. `npm run dev` inicia apenas o Next.js.

Entre como administrador manualmente pela tela de login. Uma janela anônima nova
abre deslogada. Para manter administrador e usuário comum conectados ao mesmo
tempo, use uma janela anônima ou outro perfil do navegador: guias do mesmo perfil
compartilham os cookies de autenticação. O servidor conjunto mantém o Socket.IO
em `http://localhost:3000/socket.io/`.

O tempo real avisa o promotor quando um administrador valida seu evento e atualiza
a contagem de eventos pendentes na administração. A seção **Atividade recente** em
`/myEvents` guarda as últimas 30 mudanças de criação, validação e exclusão, mesmo
após fechar a página ou excluir o evento. Em cada ambiente com banco, aplique as
migrações com `npx prisma migrate deploy` antes de iniciar esta versão.

`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` é opcional e pode ficar vazia. Sem a chave,
as páginas continuam disponíveis, a tela inicial oferece acesso à lista de eventos
e o cadastro aceita endereços digitados manualmente. Mapa, rotas e sugestões de
endereços do Google ficam disponíveis quando uma chave válida é configurada.
Reinicie o servidor depois de alterar a chave.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.


## Funcionalidades de eventos

- Descoberta por categoria, preço e distância, com localização solicitada somente ao escolher o filtro.
- Agenda pública em cards ou calendário e página compartilhável em /eventos/[id].
- Minha agenda (/salvos), favoritos, exportação de calendário ICS e lembretes de 1 hora ou 1 dia.
- Rascunhos, edição, duplicação, revisão com motivo e cancelamento preservando a página.
- Estados: DRAFT, PENDING, CHANGES_REQUESTED, PUBLISHED, CANCELLED e ENDED.
- Perfil público de organizador em /promotores/[id], seguidores e avisos de novas publicações.
- Central de notificações (/notificacoes), avisos ao vivo e leitura persistente.
- Resultados (/resultados): visualizações, cliques em ingressos e favoritos. Cliques não são vendas.
- A API pública seleciona somente dados públicos e eventos publicados. A administração usa uma consulta autenticada.

### Configuração e testes

Pare os servidores antes de gerar o cliente Prisma no Windows:

```bash
npx prisma migrate deploy
npm run prisma:generate
npm run test:features
npm run dev:socket
```

Abra http://localhost:3000. Crie um rascunho, continue pela edição, envie para análise,
peça uma correção na agenda administrativa e publique após o reenvio. Em outro perfil
do navegador, entre como usuário comum e salve/siga eventos ou promotores.
Confira os avisos na central e o histórico do organizador. Consulte Resultados após abrir
a página pública ou clicar no link externo de ingressos.

O teste integrado opcional `npm run test:features:db` usa DATABASE_URL: cria somente
usuários/eventos temporários, testa permissões e fluxos e limpa os registros ao terminar.
Use um banco de desenvolvimento. Os testes isolados não alteram o banco.

Com o servidor em execução, `npm run test:features:http` verifica páginas, APIs,
permissões e entrega dirigida pelo Socket.IO, usando registros temporários que são
removidos ao terminar.

### Lembretes e avisos externos

O servidor Socket.IO processa notificações em até 5 segundos e verifica lembretes e
encerramento de eventos a cada minuto. Ele deve permanecer em execução:
`npm run dev:socket` no desenvolvimento ou `npm run build` seguido de
`npm run start:socket` em produção. `npm run start` inicia apenas o Next.js.
Sem horário informado, lembretes usam 09:00 do dia de início no fuso do evento
(America/Sao_Paulo); o encerramento considera 23:59 do último dia.

Web Push é opcional. Para gerar as chaves e salvá-las diretamente no .env ignorado pelo Git,
sem exibi-las no terminal:

```bash
npm run push:configure -- mailto:seu-email@seu-dominio.com
```

Reinicie o servidor e clique em **Ativar avisos neste navegador** na central.
As variáveis WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY e WEB_PUSH_SUBJECT ficam no servidor;
somente a chave pública é entregue pela API de inscrição. Requer HTTPS ou localhost e
suporte do navegador; no iPhone, use o site adicionado à tela inicial. O logout remove
a inscrição deste navegador e o service worker verifica a conta ativa antes de mostrar
qualquer aviso. A central funciona mesmo sem Web Push configurado.

Métricas são indicadores aproximados: visualizações repetidas no mesmo navegador são
limitadas por uma hora e cliques por um minuto. Os totais e a evolução diária pertencem
ao organizador autenticado.

## Organização do código

Consulte [a arquitetura](docs/architecture.md) para responsabilidades, dependências e orientação para novas funcionalidades.

### Verificações de segurança e notificações

`npm run test:security` executa testes isolados de perfil, cadastro, verificação de e-mail, login direto e filas de lembretes, sem usar banco ou SMTP.

Os links de confirmação de e-mail expiram após 24 horas e são consumidos uma única vez. Contas sem confirmação não entram pelo login de senha. Uma configuração inválida de Web Push desativa somente esse envio; a central interna continua disponível. Conexões autenticadas de Socket.IO são encerradas ao expirar o JWT e o cliente tenta atualizar a sessão antes de reconectar.
