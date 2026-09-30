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
que usam banco de dados. A URL aparece no terminal (`PORT` no `.env`, ou 8081 por padrão).
Use essa mesma URL em `NEXTAUTH_URL` e `NEXT_PUBLIC_BASE_URL`.

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
