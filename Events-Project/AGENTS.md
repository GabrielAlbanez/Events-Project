# Instruções para agentes de IA

## Contexto do projeto

# Diretriz principal de Front-end

Este projeto deve ter suas interfaces e experiências visuais desenvolvidas seguindo a configuração do agente especialista em Front-end em `.codex/frontend-agent.md`.

Sempre que a solicitação envolver telas, componentes, CSS, responsividade, navegação, UX, acessibilidade ou melhoria visual, priorize estas instruções de Front-end antes de implementar qualquer alteração.

Para toda tarefa de Front-end, crie um subagente dedicado, instrua-o a ler e seguir `.codex/frontend-agent.md` e delegue a ele a análise e a implementação visual. O agente principal deve definir os arquivos sob responsabilidade do subagente, coordenar alterações para evitar conflitos e revisar a integração com tipos, validação, autenticação e dados antes de concluir. Se o ambiente não oferecer subagentes, siga a configuração diretamente e informe essa limitação.

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

## Preferência permanente de Git

- O usuário autoriza commit e push ao concluir alterações grandes neste projeto, sem pedir nova confirmação a cada entrega. O destino autorizado é `origin`, em `https://github.com/GabrielAlbanez/Events-Project.git`, na branch de trabalho da tarefa; confira o remoto antes do envio.
- Considere grandes alterações a implementação de uma funcionalidade, uma mudança significativa em uma tela ou fluxo, ou uma correção que integre várias camadas. Ajustes pontuais não exigem publicação automática, salvo pedido explícito.
- Antes de criar o commit, revise o diff e execute TypeScript, lint, build e testes pertinentes. Não publique alterações com falhas de validação não resolvidas; informe o impedimento quando uma integração externa bloquear a validação.
- Inclua somente os arquivos pertinentes à tarefa, preserve alterações locais não relacionadas e nunca adicione segredos, arquivos `.env`, credenciais ou dados privados.
- Faça commits com mensagens claras por entrega e envie a branch com push normal. Esta autorização não inclui force-push, merge, rebase, deploy ou alteração de dados no banco.
- Se o push for bloqueado pela revisão automática, informe o motivo; não contorne o bloqueio. Ao concluir, informe o hash do commit, a branch e se o push foi confirmado.

## Fluxo de trabalho recomendado

1. **Inspecionar:** identifique arquivos, dependências, scripts e alterações já existentes; leia os arquivos relacionados à funcionalidade.
2. **Planejar:** escolha a menor mudança que resolve o problema e considere efeitos em páginas, API, tipos, banco e mapa/socket quando aplicável.
3. **Implementar:** altere apenas o necessário, seguindo os padrões locais e preservando o restante do worktree.
4. **Validar:** rode `npm run lint` e `npm run build` quando viáveis; rode testes se algum script de teste for adicionado (atualmente não há `test` em `package.json`). Para tipagem isolada, use `npx tsc --noEmit --incremental false`. Se alterar o servidor Socket.IO, valide também `npx tsc --project tsconfig.server.json`. Informe falhas causadas por dependências ou serviços externos sem mascará-las.
5. **Resumir:** explique o que mudou, quais verificações passaram ou falharam e qualquer limitação pendente.

Os scripts atuais são `dev`, `dev:socket`, `prisma:generate`, `build`, `start` e `lint`. Consulte `package.json` antes de executá-los, pois eles podem mudar.

# REGRA PERMANENTE: CHECKPOINT E RETOMADA AUTOMÁTICA
Antes de começar, grave esta regra no `AGENTS.md` na raiz (crie ou acrescente ao final, sem apagar o que já existe) e siga-a durante toda esta tarefa e nas futuras.

Objetivo: nunca perder trabalho nem contexto quando meu limite de uso ou a janela de contexto estiver acabando, e continuar sozinho quando o limite voltar.

Gatilhos (qualquer um):
- Aviso da ferramenta sobre limite de uso ou contexto próximo do fim
- Erro de rate limit / "usage limit reached"
- Conversa muito longa (mais de ~80% do contexto)

Estados do `.codex/HANDOFF.md` (linha `Status:` no topo):
- `Status: EM ANDAMENTO`: trabalhando normalmente.
- `Status: PENDENTE`: parei por limite; o vigia deve me retomar.
- `Status: CONCLUÍDO`: tudo pronto; o vigia encerra.

Checkpoint preventivo: ao concluir cada etapa relevante, atualize o HANDOFF (Status: EM ANDAMENTO) com 3 a 5 linhas: o que foi feito e o próximo passo. Isso também serve para o vigia saber que a sessão está viva.

Protocolo de parada ao detectar um gatilho:
1. Termine só a unidade atômica em andamento. Não deixe arquivo pela metade nem o projeto quebrado sem registrar.
2. Não inicie nenhuma etapa nova.
3. Sobrescreva `.codex/HANDOFF.md` com `Status: PENDENTE` e as seções: Tarefa original, Critério de pronto, Concluído (arquivo e o que mudou), Estado atual (onde parei: arquivo/função/linha/passo; build ok|quebrado|não testado; testes passando|falhando|não rodados), Próximos passos em ordem, Decisões e motivos, Arquivos relevantes, Como rodar e testar, Pendências e dúvidas.
4. Se houver git: commit `wip: checkpoint <tarefa>` na branch atual, sem force e sem apagar nada.
5. Avise em até 3 linhas: o que foi feito, onde parou e que o checkpoint está salvo.

Retomada (início de toda sessão, inclusive as disparadas pelo vigia): se existir `.codex/HANDOFF.md` que não esteja CONCLUÍDO, leia-o antes de qualquer ação. Confira o estado real (git status, build, testes) contra o HANDOFF; se divergir, o código vence e o HANDOFF é corrigido. Anuncie em 1 linha o que vai continuar e siga, sem pedir contexto de novo, voltando para `Status: EM ANDAMENTO`. Ao terminar tudo, troque para `Status: CONCLUÍDO` e copie o arquivo para `.codex/handoff-archive/<data>.md`.

Segurança: se a mesma etapa falhar 2 vezes seguidas, pare, registre no HANDOFF e pergunte. Nunca declare algo concluído sem verificar com build/testes. Nunca invente progresso que não esteja no código.


