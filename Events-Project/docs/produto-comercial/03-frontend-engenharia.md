# 03 — Engenharia de Front-end (auditoria somente leitura)

Worktree auditado: `codex/produto-comercial-20261118` (HEAD `1f536cd`). Data: 18/11/2026.
Escopo: arquitetura de componentes, padrões de dados, formulários, feedback, error boundaries, carregamento, acessibilidade, desempenho e bugs de lógica de UI.

Verificações executadas (sem escrita):

- `npx next lint`: **sem avisos nem erros**.
- `curl` (GET, sem autenticação) no dev server: `/` 200 (33,9 kB de HTML), `/EventsCreated` 200, `/login` 200, `/privacidade` 200, `/eventos/<id>` 200 (2,9 s), `/api/AllEvents` 200 (3 eventos, 4,5 kB), `/nao-existe-xyz` 404 com a página padrão do Next **em inglês** ("This page could not be found"). Um evento inexistente (`/eventos/0000…`) também cai nesse 404 padrão.
- O HTML renderizado no servidor para `/` **não contém nenhum nome de evento** (testei com os 3 eventos de `/api/AllEvents`). A lista só aparece depois do JavaScript.
- Não rodei `build`/`tsc` completos nesta fase; os números de First Load JS citados vêm de `docs/performance.md`.

---

## 1. Diagnóstico geral

O front-end está acima da média em cuidado com corridas: guardas de geração e `AbortController`, limpeza de listeners de socket e mensagens de erro em pt-BR. O ponto fraco é a **arquitetura de renderização**. O layout raiz usa `cookies()` (`app/layout.tsx:36`), o que torna todas as rotas dinâmicas. A home e as páginas de conta são Client Components inteiros que buscam dados no navegador depois que a sessão resolve. Quase todas as páginas server são cascas finas, como `app/(private)/atividade/page.tsx:10` e `app/(private)/salas/[id]/page.tsx:4`, que delegam tudo a componentes cliente.

O projeto tem **apenas três `error.tsx`, nenhum `loading.tsx`, nenhum `not-found.tsx` e nenhum `global-error.tsx`**. Durante uma navegação lenta, o usuário não recebe nenhum feedback. A "barra de rota" (`components/animations/RouteTransition.tsx:50-64`) só anima **depois** que o `pathname` muda, então serve de decoração e não de indicador de progresso.

Há dois sistemas de UI em paralelo (HeroUI e Radix/shadcn), três sistemas de modal e cerca de cinco componentes de cena da home que nunca são renderizados. A busca de dados é feita à mão em mais de 20 arquivos, sem um hook comum.

## 2. Organização de componentes

| Tema | Evidência | Observação |
| --- | --- | --- |
| `components/ui` × `components/MyComponents` | `components/ui/` tem as primitivas Radix/shadcn (`dialog`, `sheet`, `sidebar`, `form`…). `MyComponents/` tem cerca de 70 componentes de domínio, sem subpastas além de `chat/`, `home/` e `notifications/`. | `app-sidebar.tsx` é de domínio, mas está em `ui/`. `MyComponents` precisa de subpastas por domínio (admin, party, community, event). Não reorganizar agora, para respeitar o AGENTS.md. |
| Dois sistemas de UI | HeroUI em `CardEvents.tsx:8`, `DrawerEventos.tsx:2`, `ModalEventsValidate.tsx:2`, `ModalUniversal.tsx:10`, `TableEventsAdmin.tsx:15`, `UserTable.tsx:23`, `FilterBarEvents.tsx:10` e `EventoForm.tsx:8`. Radix em `components/ui/dialog.tsx` (10 importadores) e `sheet.tsx`. | Três sistemas de modal: HeroUI Modal, HeroUI Drawer e Radix Dialog/Sheet. `components/ui/drawer.tsx` (vaul) **não é importado**. |
| Código morto | Nunca importados ou nunca renderizados: `home/HomeScrollScene.tsx` (só pelo `HomePresentation`, que por sua vez só é importado como **tipo** em `LuxuryHomePresentation.tsx:11`), `home/LoggedHomePresentation.tsx`, `home/LoggedHomeScrollScene.tsx`, `home/LuxuryHomeInertia.tsx`, `home/LuxuryHomeScrollScene.tsx`, `components/ui/drawer.tsx`, `components/ui/switch.tsx`, `MyComponents/CustomLoading.tsx` e `components/WrapperGlobalApiGoogle/GoogleMapsLoader.tsx` (apenas reexporta). | São cerca de 60 kB de TSX/CSS sem uso. Isso confunde quem dá manutenção. |
| Nome de arquivo com espaço | `components/MyComponents/LogoutButton .tsx`, importado como `"@/components/MyComponents/LogoutButton "` em `components/ui/app-sidebar.tsx:32`. | Frágil em scripts, globs e CI. |
| Hooks duplicados | `hooks/use-mobile.tsx` e `hooks/use-media-query.tsx` fazem a mesma coisa. O segundo lê `window` no estado inicial (`use-media-query.tsx:9-13`), o que pode causar divergência de hidratação. | Unificar em um só. |
| Reuso bom | O chat é compartilhado: `PartyConversation.tsx:9` reutiliza `EventChatView` de `EventChatHub.tsx`, e os subcomponentes em `chat/` são usados. `CommunityResource.ts` é um bom molde de hook de dados. | — |

## 3. Busca de dados e renderização

- **Home 100% cliente.** `app/page.tsx:1` usa `"use client"` e busca `/api/AllEvents` em `useEffect` (`app/page.tsx:71-86`). A ação `getAllEvents` faz `findMany` **sem limite e sem filtro de data** (`app/(actions)/getAlllEvents/action.ts:5-8`). O cliente então filtra por período e busca (`app/page.tsx:108-112`). Consequências: SEO sem eventos no HTML, LCP tardio e um payload que cresce linearmente com o catálogo.
- **Server Actions usadas como leitura.** `getSavedEvents`, `getRecommendedEvents`, `getUnreadCount`, `getRecentNotifications`, `getNotificationPage`, `getNotificationCounts` e `getRecentEventHistory` são chamadas de Client Components (`home/useLoggedHomeData.ts:25,32`, `NotificationBell.tsx:38,59`, `notificacoes/page.tsx:46,84`, `salvos/page.tsx:29`, `myEvents/page.tsx:91`). O Next 14 enfileira as Server Actions e as executa **uma de cada vez** por cliente. Na home logada, recomendações, agenda e contagem de notificações entram nessa fila em sequência, depois que a sessão resolve.
- **Busca feita à mão em todo lugar.** 22 arquivos repetem guardas como `let active = true`, `generation.current` ou `revision.current`, e 24 arquivos chamam `fetch` diretamente. A qualidade varia: `myEvents/page.tsx:51-76` reexecuta `fetchEvents` a cada `update-events` ou `connect` do socket, sem guarda de ordem entre requisições simultâneas, e uma resposta antiga pode sobrescrever outra mais nova.
- **Consulta duplicada no detalhe do evento.** `getPublicEvent` é chamado em `generateMetadata` e de novo no componente (`app/eventos/[id]/page.tsx:26,33`) sem `React.cache` (`lib/eventQueries.ts:19`). São duas consultas Prisma por visita.
- **Polling caro e global.** `ImpersonationGuard.tsx:24-54` consulta `/api/admin/impersonation/status` **a cada 5 s, para todo usuário autenticado**, inclusive com a aba oculta (não usa `visibilitychange`). Essa rota resolve a identidade no banco (`lib/auth/impersonationHttp.ts:29-32`). Isso dá cerca de 720 requisições por hora por aba aberta.

## 4. Formulários, validação e feedback

- `react-hook-form` aparece em 4 lugares: `login-form.tsx`, `register-form.tsx`, `Profile/page.tsx` (os três com `zodResolver`) e `EventoForm.tsx`, que **não usa zod**: as regras ficam inline (`EventoForm.tsx:249-370`) e duplicam a validação do servidor (`schemas/eventInput.ts`, usado em `lib/services/events.ts:7`).
- `EventoForm.tsx` tem 37 kB e chama `form.watch()` sem argumentos (`EventoForm.tsx:84`), além de serializar todo o formulário em `fingerprint` a cada render (`:85`). O formulário inteiro, com `DateRangePicker` e as pré-visualizações, renderiza de novo a cada tecla.
- **Login, três bugs concretos:**
  1. Com senha errada ou e-mail não verificado, o `authorize` retorna `null` (`lib/auth/options.ts:56,63`). O NextAuth devolve `error: "CredentialsSignin"`, e `login-form.tsx:84-86` mostra **a string bruta "CredentialsSignin"** no toast, porque o fallback em português só é usado quando `error` está vazio.
  2. Depois do sucesso, `setTimeout` encadeados de 500 ms + 500 ms (`login-form.tsx:77-81`) não têm limpeza. `isSubmitting` volta a `false` assim que `onSubmit` resolve, e o botão (`:153`) fica reativado por cerca de 1 s antes do redirecionamento, o que permite um segundo envio.
  3. `GoogleButton.tsx:28` faz `console.log(error)` e não tem estado pendente, então é possível clicar várias vezes.
- Validação em lote no admin: `TableEventsAdmin.tsx:84-122` não tem trava de envio (ao contrário de `handleRequestCorrection`, que usa `correctionLock`) e usa emojis nos toasts (`:118-119`).
- O padrão de feedback é bom: um `AppToaster` único (`components/ui/AppToaster.tsx`) e `ConfirmAction` com estado pendente. Porém `Map.tsx:9` importa de novo `react-toastify/dist/ReactToastify.css`, que já vem de `app/layout.tsx:7`.

## 5. Erros, carregamento e 404

- `error.tsx` existe apenas em `app/eventos/`, `app/promotores/` e `app/(private)/resultados/`, e os três arquivos são praticamente idênticos (`app/eventos/error.tsx` × `app/(private)/resultados/error.tsx`: só o texto muda). Não há `app/error.tsx` nem `app/global-error.tsx`. Uma exceção na home, no mapa, no admin ou nos providers mostra a tela padrão do Next em inglês.
- Não há `loading.tsx` em nenhum segmento. Como toda rota é dinâmica (`cookies()` em `app/layout.tsx:36`) e `/eventos/[id]` levou cerca de 2,9 s no curl, o clique em um link "congela" a tela sem resposta visual.
- Não há `app/not-found.tsx`: o `notFound()` em `app/eventos/[id]/page.tsx:34` e em `app/(private)/eventos/[id]/editar/page.tsx:10` mostra a página padrão em inglês. Links compartilhados de eventos removidos caem nela.

## 6. Mapa e home: bugs de lógica

- `Map.tsx:134` (sucesso da geolocalização) e `Map.tsx:232` (`clearRoute`) chamam `router.replace("/")`, o que **apaga a query string** `q`, `periodo`, `categoria`, `gratis` e `preco` que `app/page.tsx:60-69` mantém para links compartilháveis. Ao clicar em "Usar minha localização", o link deixa de refletir os filtros.
- `app/page.tsx:141`: `key={session?.user?.id ?? "visitor"}` em `LuxuryHomePresentation`. Para quem está logado, a chave muda de `"visitor"` para o id quando `useSession` resolve. Toda a apresentação é desmontada e montada de novo: as imagens recarregam e as animações reiniciam.
- **Geocodificação no navegador.** `Map.tsx:267-281` geocodifica no cliente todo evento sem `lat`/`lng`, em cada visita e sempre que `filteredEvents` muda (o cache vale só por aba, `Map.tsx:53`). Isso gera custo e cota do Google por visitante e faz os pins aparecerem em momentos diferentes.
- `Map.tsx:56-78` usa `google.maps.Marker` (descontinuado pelo Google desde fev/2024) sem agrupamento, embora `@googlemaps/markerclusterer` seja dependência (`package.json`) e **não esteja importado em lugar nenhum**.
- `PublicEventFilters.tsx` incrementa `generation.current` **durante o render** (`if (currentValue.current !== value) {…}`), um efeito colateral no render.
- `TableEventsClient.tsx:17` define o mês inicial com `new Date().toISOString().slice(0, 7)`, em UTC. No último dia do mês, depois das 21h em Brasília, o calendário abre no mês seguinte. O `useMemo` da linha 19 depende de `published`, recriado a cada render, então não memoriza nada.

## 7. Desempenho e bundle

- O shell global (`ClientProviders.tsx`) importa estaticamente `NotificationBell`, que importa `NotificationBanners.tsx:5` com o `motion`/`animate` **completo** do Framer Motion, em vez de `LazyMotion` + `m`, contrariando a skill do projeto. Isso pesa em todas as páginas de usuários logados.
- `home/LuxuryHomePresentation.tsx:6` e `home/HeroDiscovery.tsx:5` também usam `motion` completo.
- `app/(publicRoutes)/EventsCreated/page.tsx:9-10` importa estaticamente `TableEventsAdmin` (tabela HeroUI), embora só admins a vejam. Segundo `docs/performance.md`, `/EventsCreated` tem 402 kB de First Load JS, a página pública mais pesada.
- O Tailwind varre **todo** `node_modules/@heroui/theme/dist/**` (`tailwind.config.ts:11`), o que torna a linha 12, mais restrita, redundante e aumenta o CSS gerado.
- `next/image` aparece em apenas 7 componentes. Ainda há 13 `<img>`, incluindo a imagem de LCP do detalhe do evento (`app/eventos/[id]/page.tsx:40`, banner com `fetchPriority="high"`) e as miniaturas da lista da home (`app/page.tsx:183`). O `remotePatterns` (`next.config.mjs:61-67`) não cobre a origem dos uploads/blobs, então a migração precisa passar pelas rotas `/api/media`.

## 8. Acessibilidade em código

- **Landmark `<main>` aninhado.** O layout envolve tudo em `<main>` (`components/Providers/ClientProviders.tsx:33`), e mais 30 arquivos renderizam outro `<main>` dentro dele (por exemplo `app/page.tsx:142`, `app/eventos/[id]/page.tsx:40`, `CommunityRooms.tsx`, `EventChatHub.tsx` e todos os `error.tsx`). Leitores de tela anunciam dois landmarks principais. Também não há "pular para o conteúdo".
- `Map.tsx:357`: o botão de fechar é só o texto "×", sem área mínima de 44 px. `Map.tsx:362`: botão só com ícone, nomeado apenas por `title`.
- **Rota órfã.** `/admin/auditoria` (`app/(adminRoutes)/admin/auditoria/page.tsx`) aparece nos grupos de `app-sidebar.tsx:78`, mas não tem item em `navigation` (`:38-54`) nem link em nenhum lugar. Só é acessível digitando a URL.
- Pontos positivos: `aria-pressed` nos filtros, `role="status"` e `role="alert"` nos estados, rótulos nos inputs da home e foco gerenciado no painel de notificações.

## 9. Funcionalidades visuais ou não conectadas

1. `components/animations/RouteTransition.tsx:50-64`: a "barra de progresso" só aparece depois que a navegação termina e não indica carregamento.
2. `/admin/auditoria`: tela funcional, mas sem nenhum link (`app-sidebar.tsx:78` só a lista em `groups.paths`).
3. As cenas de scroll 3D da home (`home/HomeScrollScene.tsx`, `LoggedHomeScrollScene.tsx`, `LuxuryHomeScrollScene.tsx`, `LuxuryHomeInertia.tsx`, `LoggedHomePresentation.tsx`) existem e são documentadas (`docs/home-scroll-3d.md`), mas não são renderizadas.
4. `@googlemaps/markerclusterer` está instalado, mas nunca é usado (o mapa não agrupa pins).
5. `components/ui/drawer.tsx` (vaul), `components/ui/switch.tsx` e `MyComponents/CustomLoading.tsx` são primitivas não utilizadas.

---

## 10. Oportunidades priorizadas

### FE-01 (P0): cobertura de carregamento, erro e 404 no App Router
- **Problema:** não há `loading.tsx`, `not-found.tsx` nem `global-error.tsx`; existem três `error.tsx` duplicados; o 404 aparece em inglês; e a navegação fica sem feedback em rotas dinâmicas.
- **Solução:** criar `components/ui/PageState.tsx` (estados de erro, vazio e carregamento reutilizáveis), `app/error.tsx`, `app/global-error.tsx` (com `<html>`/`<body>` próprios), `app/not-found.tsx` em pt-BR com CTA para a agenda e `loading.tsx` com skeleton em `app/eventos/[id]/`, `app/promotores/[id]/`, `app/(private)/` e `app/(adminRoutes)/admin/`. Refatorar os três `error.tsx` existentes para usar `PageState`.
- **Arquivos:** `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, `app/**/loading.tsx`, `app/eventos/error.tsx`, `app/promotores/error.tsx`, `app/(private)/resultados/error.tsx`, `components/ui/PageState.tsx`.
- Complexidade S. Sem schema. Sem credenciais.

### FE-02 (P0): bugs do login (mensagem bruta, timers e duplo envio)
- **Problema:** o toast mostra "CredentialsSignin"; os `setTimeout` não têm limpeza; o botão é reativado antes do redirecionamento; o botão do Google não tem estado pendente e faz `console.log`.
- **Solução:** mapear os códigos do NextAuth (`CredentialsSignin`, `AccountSuspended`) para mensagens em pt-BR; manter um estado `redirecting` que deixa o botão desabilitado até `router.replace`; trocar os timers aninhados por `await update(); router.replace(); router.refresh()`; adicionar `pending` ao `GoogleButton` e remover o `console.log`.
- **Arquivos:** `components/login-form.tsx:70-90,153`, `components/MyComponents/GoogleButton.tsx:14-31`.
- Complexidade S. Sem schema.

### FE-03 (P0): polling de 5 s do ImpersonationGuard para todos os usuários
- **Problema:** cada usuário logado gera cerca de 720 requisições por hora com acesso ao banco, mesmo com a aba oculta.
- **Solução:** fazer polling só quando `session.impersonation` ou `session.error === "AccountImpersonated"` estiverem ativos ou quando o socket estiver desconectado; nos demais casos, consultar ao focar ou voltar a ficar visível e reagir a um evento de socket (o servidor já conhece `impersonationId`, `server.mts:133`). Pausar com `document.visibilityState` e usar backoff de 30 a 60 s.
- **Arquivos:** `components/MyComponents/ImpersonationGuard.tsx:24-54` (opcional: emissor em `server.mts` ou `utils/socket.ts`).
- Complexidade S. Sem schema.

### FE-04 (P0): mapa e home (filtros apagados, remontagem e geocodificação no cliente)
- **Problema:** `router.replace("/")` apaga os filtros da URL (`Map.tsx:134,232`); a `key` por sessão remonta a home (`app/page.tsx:141`); o navegador geocodifica eventos sem coordenadas (`Map.tsx:267-281`); os marcadores são descontinuados e não há agrupamento.
- **Solução:** substituir `router.replace("/")` por uma remoção pontual de `endereco` que preserve a query; tirar a `key` (ou usar `status` estável) e deixar a apresentação reagir ao `session`; mostrar só eventos com `lat`/`lng` e sinalizar "local sem coordenada" (a geocodificação já acontece no cadastro via `PlaceAutocomplete`); usar `MarkerClusterer` com `AdvancedMarkerElement` quando houver `mapId`.
- **Arquivos:** `components/MyComponents/Map.tsx`, `app/page.tsx`.
- Complexidade M. Sem schema. Agrupamento e geocodificação usam a chave do Maps já existente.

### FE-05 (P1): home com dados iniciais no servidor (SEO e LCP)
- **Problema:** o HTML de `/` não traz nenhum evento; a lista depende de JavaScript, da sessão e de uma busca ilimitada (`getAlllEvents/action.ts:5-8`).
- **Solução:** transformar `app/page.tsx` em Server Component que busca os eventos publicados futuros (com `take` e filtro `dataFim >= hoje`) e passa `initialEvents` para um `HomeDiscoveryClient` (o código cliente atual). O socket continua atualizando a lista. Aplicar o mesmo padrão em `/EventsCreated`.
- **Arquivos:** `app/page.tsx` → novo `components/MyComponents/home/HomeDiscoveryClient.tsx`, `app/(actions)/getAlllEvents/action.ts`, `app/api/AllEvents/route.ts`, `app/(publicRoutes)/EventsCreated/page.tsx`.
- Complexidade M. Sem schema.

### FE-06 (P1): enxugar o bundle (Framer global, tabela admin, Tailwind/HeroUI)
- **Problema:** o `motion` completo entra no shell global (`NotificationBanners.tsx:5`); a tabela HeroUI de admin entra na agenda pública (`EventsCreated/page.tsx:10`, 402 kB de First Load); o Tailwind varre todo o tema HeroUI; o CSS do toastify é importado duas vezes.
- **Solução:** usar `LazyMotion` + `m` em `NotificationBanners`, `LuxuryHomePresentation` e `HeroDiscovery`; aplicar `next/dynamic` a `NotificationBell`/`NotificationBanners` (só para quem está logado) e a `TableEventsAdmin` (só para admin); restringir `tailwind.config.ts:11` aos componentes HeroUI realmente usados (button, calendar, card, date-picker, drawer, dropdown, modal, table, spinner, popover…); remover `Map.tsx:9`. Medir com `npm run analyze`.
- **Arquivos:** `components/MyComponents/NotificationBanners.tsx`, `components/Providers/ClientProviders.tsx`, `components/MyComponents/home/LuxuryHomePresentation.tsx`, `components/MyComponents/home/HeroDiscovery.tsx`, `app/(publicRoutes)/EventsCreated/page.tsx`, `tailwind.config.ts`, `components/MyComponents/Map.tsx`.
- Complexidade M. Sem schema.

### FE-07 (P1): leituras fora da fila de Server Actions
- **Problema:** as leituras feitas por Server Actions a partir do cliente são executadas em série (home logada: recomendações → agenda → contagem de notificações).
- **Solução:** expor GETs leves (`/api/me/saved`, `/api/me/recommendations`, `/api/notifications/unread`) que reutilizam os serviços de `lib/services/*`, ou entregar os dados por props a partir de Server Components. Manter as Server Actions para mutações.
- **Arquivos:** `components/MyComponents/home/useLoggedHomeData.ts`, `components/MyComponents/NotificationBell.tsx`, `app/(private)/salvos/page.tsx`, `app/(private)/notificacoes/page.tsx`, `app/(actions)/engagement/action.ts`, novas rotas em `app/api/`.
- Complexidade M. Sem schema.

### FE-08 (P1): hook único de recurso remoto
- **Problema:** 22 arquivos repetem guardas de corrida e 24 fazem `fetch` direto, com qualidade desigual (`myEvents/page.tsx:51-76` não tem guarda de ordem).
- **Solução:** generalizar `components/MyComponents/CommunityResource.ts` em `hooks/useRemoteResource.ts` (abort, timeout, identidade da sessão, revalidação por socket ou visibilidade, `retry`, estado `stale`) e migrar primeiro `myEvents`, `EventsCreated`, `salvos`, `admin` e `admin/reports`. Não exige nova dependência.
- **Arquivos:** `hooks/useRemoteResource.ts`, `components/MyComponents/CommunityResource.ts`, `app/(private)/myEvents/page.tsx`, `app/(publicRoutes)/EventsCreated/page.tsx`, `app/(private)/salvos/page.tsx`, `app/(adminRoutes)/admin/page.tsx`, `app/(adminRoutes)/admin/reports/page.tsx`.
- Complexidade M. Sem schema.

### FE-09 (P1): EventoForm (desempenho e validação compartilhada)
- **Problema:** `form.watch()` sem argumentos e o `fingerprint` renderizam de novo um formulário de 37 kB a cada tecla; as regras inline divergem do schema zod do servidor.
- **Solução:** dividir em seções (`EventBasicsSection`, `EventLocationSection`, `EventTicketSection`, `EventMediaSection`, `EventRecurrenceSection`) com `useWatch` local; calcular o `fingerprint` com `useFormState({ isDirty })` ou em um debounce; derivar de `schemas/eventInput.ts` um schema de cliente e usar `zodResolver`, mantendo as mensagens atuais.
- **Arquivos:** `components/MyComponents/EventoForm.tsx`, `schemas/eventInput.ts`, novos arquivos em `components/MyComponents/event-form/`.
- Complexidade M. Sem schema.

### FE-10 (P1): landmarks, navegação e alvos de toque
- **Problema:** `<main>` aninhado em 30 arquivos; não há link para pular ao conteúdo; a rota `/admin/auditoria` não tem link; o botão "×" do mapa é pequeno.
- **Solução:** trocar o `<main>` de `ClientProviders.tsx:33` por `<div>` e manter um único `<main id="conteudo">` por página (ou o inverso: o layout fica com o `<main>` e as páginas usam `<div>`/`<section>`); adicionar um "Pular para o conteúdo" no `SiteHeader`; incluir o item "Auditoria de acesso" em `app-sidebar.tsx` para ADMIN; ajustar `Map.tsx:357,362` (ícone `X`, `aria-label`, 44 px).
- **Arquivos:** `components/Providers/ClientProviders.tsx`, `components/MyComponents/SiteHeader.tsx`, `components/ui/app-sidebar.tsx`, `components/MyComponents/Map.tsx` e as páginas com `<main>`.
- Complexidade S. Sem schema.

### FE-11 (P2): limpeza de código morto e duplicado
- **Solução:** remover as cenas da home sem uso, mover `HomePresentationProps` para `types/`, apagar `ui/drawer`, `ui/switch`, `CustomLoading` e `WrapperGlobalApiGoogle`, renomear `LogoutButton .tsx` → `LogoutButton.tsx`, unificar `use-mobile`/`use-media-query` e definir um único sistema de modal para telas novas (Radix `ui/dialog`).
- **Arquivos:** os listados na seção 2.
- Complexidade S. Sem schema.

### FE-12 (P2): pequenas correções de lógica e desempenho no servidor
- **Solução:** envolver `getPublicEvent` em `React.cache` (`lib/eventQueries.ts:19`) para evitar a consulta dupla em `app/eventos/[id]/page.tsx:26,33`; calcular o mês local em `TableEventsClient.tsx:17` e corrigir o `useMemo` da linha 19; tirar o efeito colateral do render em `PublicEventFilters.tsx` (incremento de `generation`); adicionar trava de envio em `TableEventsAdmin.tsx:84` e remover os emojis dos toasts; migrar o banner de LCP do detalhe do evento para `next/image` usando as rotas de mídia locais.
- Complexidade S. Sem schema.

---

## 11. Ordem sugerida para este ciclo (sem mudar o schema)

1. FE-02, FE-01, FE-03 e FE-10: correções rápidas que aumentam a percepção de qualidade e reduzem a carga.
2. FE-04 e FE-06: mapa estável e bundle menor.
3. FE-05 e FE-07: SEO e tempo até o primeiro conteúdo.
4. FE-08 e FE-09: base para manter o produto em escala.
5. FE-11 e FE-12 ao longo do ciclo.

Nenhuma das 12 oportunidades exige alterar `prisma/schema.prisma` nem credenciais novas. Antes de publicar qualquer mudança, validar com `npm run lint`, `npx tsc --noEmit --incremental false` e `npm run build`, mais os scripts `test:*` relacionados (por exemplo `test:site-improvements`, `test:notifications` e `test:security`), seguindo `eventmap-validate`.
