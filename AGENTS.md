# Instruções para agentes de IA

## Contexto do projeto

EventMap é uma aplicação para descobrir, cadastrar e administrar eventos, com busca, mapa e recursos de conta. Usa Next.js 14 (App Router), React 18, TypeScript estrito, Tailwind CSS, componentes HeroUI/Radix, Prisma com PostgreSQL, NextAuth, Google Maps e Socket.IO. Não presuma que banco, Google Maps ou outras integrações externas estejam disponíveis no ambiente local.

- `app/`: páginas, layouts, grupos de rotas (`(auth)`, `(private)`, `(adminRoutes)`, `(publicRoutes)`), handlers em `api/` e server actions em `(actions)/`.
- `components/MyComponents/`: componentes de domínio, incluindo mapa, eventos, formulários e filtros; `components/ui/`: componentes de interface compartilhados; `components/Providers/`: providers globais.
- `types/`, `schemas/`, `hooks/`, `context/`, `lib/` e `utils/`: tipos, validação Zod, hooks, contextos e utilitários. `lib/prisma.ts` centraliza o cliente Prisma da aplicação.
- `prisma/schema.prisma` e `prisma/migrations/`: modelo e migrações do banco. `server.mts`, `tsconfig.server.json` e `utils/socket.ts`: servidor HTTP/Socket.IO separado.
- `app/globals.css` e `tailwind.config.ts`: estilos globais e tema. `public/` e `assets/`: arquivos estáticos.

## Padrões para alterações

- Antes de editar uma funcionalidade, leia os arquivos relacionados e siga seu fluxo completo: componente/página, tipos e schemas, action ou rota de API, modelos Prisma e providers/contextos relevantes. Para mapa, confira também `components/MyComponents/GoogleMapsLoader.tsx`, `components/MyComponents/Map.tsx`, `components/MyComponents/PlaceAutocomplete.tsx` e `components/Providers/ClientProviders.tsx`.
- Faça mudanças pequenas, objetivas e compatíveis com o comportamento atual. Evite renomeações, reorganização de pastas, novas dependências ou refatorações amplas sem necessidade. Preserve as alterações já presentes no worktree, inclusive as feitas pelo usuário.
- Mantenha a organização existente: páginas em `app/`, UI reutilizável em `components/ui/`, componentes do produto em `components/MyComponents/`, validação em `schemas/` e acesso a dados no lado do servidor. Respeite os nomes e rotas já publicados, mesmo quando a nomenclatura existente for inconsistente.
- Use TypeScript com tipos explícitos para props, respostas e dados compartilhados; reutilize `types/index.ts` e os schemas Zod existentes. Evite introduzir `any` ou suposições sobre dados opcionais. Use `"use client"` somente para componentes que precisam de estado, efeitos ou APIs do navegador.
- Siga o padrão de imports com alias `@/` para módulos do projeto e imports relativos para arquivos próximos. Mantenha o estilo de aspas e formatação do arquivo editado; não reformate trechos não relacionados.
- Prefira classes Tailwind e os componentes/variantes de UI existentes. Use `app/globals.css` para estilos globais, preservando identidade visual, tema claro/escuro, responsividade e acessibilidade. Não acrescente animações pesadas ao mapa nem efeitos que atrapalhem sua interação.
- Trate falhas de rede, banco, autenticação e APIs externas com estados de erro ou fallback úteis. Não deixe carregamentos infinitos, não esconda erros silenciosamente e não exponha detalhes sensíveis ao usuário ou aos logs. Em efeitos e listeners, faça a limpeza necessária para evitar duplicação.

## Segurança e preservação

- Nunca divulgue, copie para respostas ou registre em logs chaves, tokens, senhas, URLs de conexão ou conteúdo de arquivos `.env`. Não adicione segredos ao código, exemplos ou commits. Variáveis `NEXT_PUBLIC_*` ficam visíveis no navegador: use-as somente para valores destinados ao cliente.
- Inspecione `git status` e o diff relevante antes de editar. Não descarte mudanças existentes nem use comandos destrutivos como `git reset --hard` ou `git checkout --` para limpar o trabalho do usuário.
- Mudanças em `prisma/schema.prisma` devem considerar as migrações e o código consumidor. Não execute migrações destrutivas nem altere dados de produção sem autorização explícita.

## Fluxo de trabalho recomendado

1. **Inspecionar:** identifique arquivos, dependências, scripts e alterações já existentes; leia os arquivos relacionados à funcionalidade.
2. **Planejar:** escolha a menor mudança que resolve o problema e considere efeitos em páginas, API, tipos, banco e mapa/socket quando aplicável.
3. **Implementar:** altere apenas o necessário, seguindo os padrões locais e preservando o restante do worktree.
4. **Validar:** rode `npm run lint` e `npm run build` quando viáveis; rode testes se algum script de teste for adicionado (atualmente não há `test` em `package.json`). Para tipagem isolada, use `npx tsc --noEmit --incremental false`. Se alterar o servidor Socket.IO, valide também `npx tsc --project tsconfig.server.json`. Informe falhas causadas por dependências ou serviços externos sem mascará-las.
5. **Resumir:** explique o que mudou, quais verificações passaram ou falharam e qualquer limitação pendente.

Os scripts atuais são `dev`, `dev:socket`, `prisma:generate`, `build`, `start` e `lint`. Consulte `package.json` antes de executá-los, pois eles podem mudar.
