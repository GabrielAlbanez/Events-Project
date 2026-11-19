# 02 — Auditoria UX/UI do EventMap

> Papel: designer sênior de UX/UI. Escopo: toda a interface web (Next.js 14) do worktree `codex/produto-comercial-20261118`.
> Método: leitura de código (componentes, páginas, tokens), contagens com `grep` e `curl` GET não autenticado em `http://localhost:3000`. Fase **somente leitura**: nenhum arquivo além deste foi alterado.
> Referências de qualidade: Linear, Stripe, Vercel, Apple, Notion, Airbnb e Framer, usadas como régua de clareza, hierarquia e acabamento, não como modelos para copiar.

---

## 1. Diagnóstico executivo

O EventMap tem uma **base visual acima da média para um produto nesta fase**. Os tokens HSL semânticos estão em `app/globals.css:53-137` e têm variantes claro/escuro. O HeroUI foi mapeado para os mesmos tokens (`app/globals.css:15-47`). Os alvos de toque têm 44 px em `components/ui/button.tsx:26-29` e `components/ui/input.tsx`. A página respeita `prefers-reduced-motion` (`app/globals.css:156-202`) e oferece estados vazio e de erro em muitas telas, como `app/(private)/myEvents/page.tsx:193-209` e `app/(publicRoutes)/EventsCreated/page.tsx:79-91`.

O que impede o produto de parecer **profissional e vendável** é a **falta de sistema**, mais do que a estética de cada tela:

1. **Faltam alguns tokens e componentes de composição.** Não há tokens `success` e `warning`, por isso amber e emerald aparecem soltos em mais de 15 arquivos. Também não existem `PageHeader`, `StatusBadge`, `EventCard` único nem `NativeSelect`. Cada página refaz o cabeçalho com pequenas variações.
2. **Dois sistemas de componentes convivem sem regra.** Botões, modais, tabelas e chips do HeroUI aparecem ao lado de Radix e shadcn. Há 4 arquivos com `Modal` do HeroUI e 9 com `Dialog` do Radix, e `CardEvents.tsx` usa os dois. As cores `success` e `warning` do HeroUI não foram mapeadas para os tokens do app.
3. **A arquitetura de navegação está fraca.** No desktop o header mostra só três links (`SiteHeader.tsx:207-211`). Tudo o resto fica num menu off-canvas fechado por padrão (`app/layout.tsx:329`). Os ícones se repetem e a privacidade ocupa dois itens. A página `/admin/auditoria` está órfã, e o sino de notificações é um botão flutuante fixo no canto inferior direito.
4. **Faltam estados globais.** Não existe nenhum `loading.tsx`, `not-found.tsx`, `app/error.tsx` ou `global-error.tsx`. A rota `/pagina-inexistente` devolve a página 404 padrão do Next, **em inglês** ("This page could not be found"), confirmado via `curl`.
5. **A semântica e a acessibilidade são quebradas pela estrutura.** O layout global envolve tudo em `<main>` (`ClientProviders.tsx:33`), e mais 29 arquivos abrem outro `<main>` dentro dele. Na home, o HTML servido tem 2 `<main>` aninhados. Há rótulos de leitor de tela em inglês ("Close", "Toggle Sidebar", "Event management table").
6. **As telas que geram receita estão subaproveitadas.** O painel Resultados tem 30 dias de métricas diárias no back-end (`lib/services/promoters.ts:67`), mas mostra só 7 barras sem datas e não calcula conversão. Os cards da Agenda não mostram preço nem categoria. A página do evento exibe "Não informado" repetidas vezes. Também não há rodapé, Termos de Uso nem página para organizadores.

A recomendação é um ciclo de **"sistema primeiro"**: tokens, primitivas de composição e estados globais, seguidos de redesenhos focados em Navegação, Página do evento, Resultados e Admin. Nada disso exige mudança de schema Prisma.

---

## 2. Evidências coletadas

### 2.1 Respostas do servidor (GET, sem autenticação)

| Rota | HTTP | Observação |
|---|---|---|
| `/` | 200 | HTML com `<main class="SiteHeader_shell…">` contendo `<main id="home-discovery">`, ou seja, `main` aninhado |
| `/login`, `/register`, `/recuperar-senha` | 200 | Três telas de autenticação, com **dois shells visuais diferentes** (ver 3.6) |
| `/EventsCreated`, `/privacidade`, `/demonstracao` | 200 | — |
| `/CriarEvento`, `/myEvents`, `/admin`, `/salvos` | 307 → `/login?callbackUrl=…` | O redirecionamento de autenticação funciona |
| `/pagina-inexistente` | 404 | **404 padrão do Next, em inglês**: `<h1 class="next-error-h1">404</h1> This page could not be found.` |
| `/eventos/inexistente` | 404 | `notFound()` em `app/eventos/[id]/page.tsx:34` cai no mesmo 404 padrão |

### 2.2 Contagens no código (`app/` + `components/`)

| Métrica | Valor | Leitura |
|---|---|---|
| `<button ` nativos | 129 | contra 101 usos de `<Button`. Metade dos botões não passa pelas variantes do sistema |
| `<select ` nativos | 13 | `components/ui/select.tsx` (Radix) só é importado em 4 arquivos. A string de classes do select se repete (`EventoForm.tsx:269,300,307`) |
| `<input ` nativos fora de `ui/` | 29 | Exemplos: `myEvents/page.tsx:181` e `EventoForm.tsx:312,369` |
| Cores Tailwind de paleta crua (amber/emerald/red…) | 15 em `CardEvents.tsx`, 11 em `ActivityDashboard.tsx`, 9 em `EventsCreated/page.tsx`, 7 em `checkin/page.tsx`, 6 em `admin/page.tsx` e 6 em `reports/page.tsx` | Não há token de sucesso nem de aviso |
| Arquivos com `<main` | 31 | 29 deles ficam dentro do `<main>` global de `ClientProviders.tsx:33` |
| `loading.tsx` / `not-found.tsx` / `global-error.tsx` | 0 / 0 / 0 | Há só 3 `error.tsx` de segmento: `eventos`, `promotores` e `resultados` |
| `toast.error/success` | 57 | Muitos erros de formulário aparecem **só** em toast, que some depois de 4 s (`AppToaster.tsx:22`) |
| `rounded-xl` / `rounded-2xl` / `rounded-3xl` | 222 / 155 / 33 | O raio é consistente, um ponto forte |
| Hex em TSX | 15 em `Map.tsx` (estilo escuro do Google Maps, justificado) e 4 em `GoogleButton.tsx` (marca do Google) | Aceitável |

---

## 3. Auditoria por área

### 3.1 Tokens e identidade (`app/globals.css`, `tailwind.config.ts`)

**Pontos fortes**
- Paleta semântica completa (background, card, popover, primary, brand, cta, muted, destructive, chart-1 a 5, sidebar-*) com `<alpha-value>` (`tailwind.config.ts:24-79`).
- Sombras com nome (`surface`, `highlight`, `sheet`) e motion tokens (`--em-motion-*`, `globals.css:150-154`).
- A ponte HeroUI → tokens (`globals.css:15-47`) evita que os portais do HeroUI fiquem com outra paleta.

**Problemas**
- **Não existem `--success`, `--warning` e `--info`.** O resultado é amber e emerald repetidos à mão: `EventsCreated/page.tsx:78`, `admin/page.tsx:120`, `myEvents/page.tsx:161-162`, `ActivityDashboard.tsx:70-90`, `CardEvents.tsx:119,203` e `login-form.tsx:102`. A ponte HeroUI também não mapeia `--heroui-success` nem `--heroui-warning`, então os `Chip` e `Button color="warning|success"` de `TableEventsAdmin.tsx:254` e `UserTable.tsx:281` usam o verde e o laranja padrão do HeroUI, diferentes dos tons emerald/amber usados no resto.
- **Dois "primários" concorrem.** O azul `--primary` (226° 100% 57%) e o lima `--cta` têm papéis indefinidos. O lima marca o **item ativo** do menu (`app-sidebar.tsx:104`), o botão "Novo evento" logo abaixo (`app-sidebar.tsx:118`), o submit do login (`login-form.tsx:153`) e o submit do perfil (`Profile/page.tsx:248`). O azul marca o "Criar evento" de Meus eventos (`myEvents/page.tsx:153`) e o "Criar conta" do header (`SiteHeader.module.css:18`). A mesma ação, "criar evento", aparece em lima na sidebar e em azul na página.
- **A documentação diverge do código.** `.codex/frontend-agent.md:7` manda "preservar destaque **violeta**", mas os tokens são azul e lima. Um agente que siga a documentação vai introduzir violeta.
- **A tipografia não tem escala nomeada.** Os eyebrows variam entre `text-sm … tracking-widest font-semibold` (`CriarEvento/page.tsx:11`, `resultados/page.tsx:26`) e `text-xs … tracking-[0.18em]` (`myEvents/page.tsx:148`, `Profile/page.tsx:205`, `EventsCreated/page.tsx:77`). O H1 alterna `font-bold` e `font-semibold` entre páginas irmãs.

### 3.2 Navegação (`components/ui/app-sidebar.tsx`, `SiteHeader.tsx`, `ClientProviders.tsx`)

- **Desktop:** o header (`SiteHeader.tsx:207-211`) tem só Descobrir, Agenda e Mapa. Para promotores e administradores, as tarefas principais (Criar evento, Meus eventos, Resultados, Admin) ficam no off-canvas, que começa **fechado**: `defaultOpen` só é verdadeiro quando o cookie vale `"true"` (`app/layout.tsx:329`). Em Linear e Vercel, a área de trabalho de quem opera fica sempre visível.
- **Ícones repetidos** (`app-sidebar.tsx:38-55`): `CalendarCheck` aparece em Agenda, Minha agenda e Notificações. `LayoutDashboard` aparece em Central de atividades, Meus eventos e Resultados. `UsersRound` aparece em Salas, Usuários e Revisar denúncias. O usuário perde a capacidade de reconhecer itens pelo ícone.
- **A privacidade ocupa dois itens** ("Privacidade e preferências" e "Seus dados e direitos", `app-sidebar.tsx:40-41`), e isso também para visitantes. Em produtos comerciais esse tema costuma ir para o rodapé ou para Configurações.
- **Rota órfã:** o grupo "Administrar" lista `/admin/auditoria` (`app-sidebar.tsx:78`), mas o array `navigation` não tem esse item, então a página `app/(adminRoutes)/admin/auditoria/page.tsx` não aparece em lugar nenhum da interface. Já `/admin/reports` só é acessível por um link no cabeçalho de `/admin` (`admin/page.tsx:110`).
- **A moderação de eventos fica na rota pública.** O administrador revisa eventos em `/EventsCreated` ("Agenda de eventos"), que muda de forma conforme o papel (`EventsCreated/page.tsx:94-102`). Não existe "Eventos para revisar" no grupo Administrar.
- **Sino flutuante:** `NotificationBell.tsx:120` é `fixed right-5 bottom-[…]` em todas as rotas exceto `/`. Nas telas de chat o composer fica no rodapé com o botão de enviar à direita (`chat/Chat.module.css:54`, `MessageInput.tsx:14`), o que deve gerar **sobreposição** no celular. Isso precisa de verificação visual, que não foi possível nesta fase. O sino também não faz parte do header, que é o padrão esperado.
- O tema só pode ser trocado no rodapé da sidebar (`app-sidebar.tsx:125-128`), e `defaultTheme="light"` sem opção "Sistema" (`ClientProviders.tsx:25`) ignora a preferência do sistema operacional.

### 3.3 Estrutura, landmarks e acessibilidade

- **`<main>` aninhado:** `ClientProviders.tsx:33` cria `<main>`, e páginas como `CriarEvento/page.tsx:6`, `myEvents/page.tsx:132`, `resultados/page.tsx:25`, `admin/page.tsx:108`, `app/page.tsx:142` e `app/eventos/[id]/page.tsx:40` (29 arquivos ao todo) abrem outro dentro dele. Leitores de tela anunciam regiões principais duplicadas, e "pular para o conteúdo" perde o sentido.
- **Rótulos em inglês nas primitivas:** `components/ui/dialog.tsx:49` e `sheet.tsx:69` ("Close"), `sidebar.tsx:278,294,297` ("Toggle Sidebar"), `carousel.tsx:220,249` ("Previous/Next slide") e `TableEventsAdmin.tsx:227` (`aria-label="Event management table"`).
- **Asterisco de obrigatório:** `EventoForm.tsx:444` usa `<span aria-label="obrigatório">*</span>`. Um `aria-label` num `span` sem papel não é anunciado de forma confiável. O padrão correto é `aria-hidden` no asterisco mais um texto `sr-only` "(obrigatório)", ou `aria-required` no controle.
- **Campo de endereço sem `<label>`:** `EventoForm.tsx:320` rotula com um `<span>`. O controle compensa com `aria-label`, mas o rótulo visível não fica associado ao campo.
- **Erros de login só em toast:** `login-form.tsx:84-87` mostra `signInResponse?.error` cru. Quando o NextAuth devolve um código como `CredentialsSignin`, o usuário lê um código interno em inglês, e a mensagem some em 4 s. Depois do sucesso, o formulário espera 1 s artificialmente (`login-form.tsx:77-82`) com o botão já reabilitado, o que permite um segundo envio.
- **Foco inconsistente:** alguns controles usam `focus-visible:ring-2` (Button, Input) e outros `focus-visible:outline-2` (`myEvents/page.tsx:153,185`, `TableEventsClient.tsx:13`). Os dois são visíveis, mas a aparência muda de tela para tela.
- O gráfico de Resultados tem `role="img"` com `aria-label` descritivo (`resultados/page.tsx:33`), o que é bom. Já as datas de cada barra só aparecem em `title`, ou seja, ao passar o mouse, e não são acessíveis por teclado nem no toque.

### 3.4 Estados: carregamento, vazio e erro

- **Carregamento:** um único esqueleto de qualidade, em `EventsCreated/page.tsx:80-89`, e skeletons na home (`LuxuryHomePresentation.tsx`, `styles.skeleton`). O resto é texto puro: "Carregando seus eventos..." (`myEvents/page.tsx:194`), "Carregando resultados..." (`resultados/page.tsx:27`), "Preparando painel de usuários..." (`admin/page.tsx:104`), "Carregando perfil..." (`Profile/page.tsx:194`) e "Carregando denúncias..." (`admin/reports/page.tsx`). `components/ui/skeleton.tsx` só é usado em `sidebar.tsx`.
- **Segmentos sem `loading.tsx`.** Nas páginas server-side (`app/eventos/[id]/page.tsx`, `promotores/[id]`) a navegação fica sem nenhum feedback até o servidor responder, exceto pela barrinha de `RouteTransition.tsx:36`, que **só anima depois** que o `pathname` muda.
- **Vazio:** bons exemplos em `myEvents/page.tsx:197-209` (primeiro evento e filtros sem resultado) e na home. Na Agenda, o vazio filtrado (`TableEventsClient.tsx:20`, "Nenhum evento encontrado. Experimente outros filtros.") **não oferece botão para limpar os filtros**.
- **Erro:** `app/eventos/error.tsx` é um bom modelo, com tentar de novo e uma rota de saída. Falta a versão global (`app/error.tsx`, `app/global-error.tsx`) e a página `app/not-found.tsx`.
- **Texto enganoso:** na home mobile, o puxador do sheet diz "Falha ao atualizar · toque para tentar novamente" (`app/page.tsx:148`), mas o toque só expande o sheet (`app/page.tsx:144`). O botão que tenta de novo fica dentro do sheet (`app/page.tsx:180`).

### 3.5 Cards de evento

Existem pelo menos **quatro implementações** de card de evento:

| Onde | Arquivo | Preço | Categoria | Status |
|---|---|---|---|---|
| Home (sugestões) | `home/LuxuryHomePresentation.tsx:31-32` | sim | sim | — |
| Agenda pública | `TableEventsClient.tsx:13` (`EventCards`) | **não** | **não** | cancelado/encerrado em texto |
| Meus eventos | `CardEvents.tsx` (HeroUI + Radix) | — | — | badge emerald/amber à mão (`:119`) |
| Admin | `TableEventsAdmin.tsx` (cards no mobile, Table no desktop) | — | — | `Chip` HeroUI (`:253`) |

Na Agenda, que é a vitrine principal, quem decide se vai a um evento não vê o preço nem o tipo de evento, embora `priceCents` e `category` estejam no payload, porque `PublicEventFilters.tsx:12` filtra por eles.

### 3.6 Formulários

- **Criar/Editar evento** (`EventoForm.tsx`) tem boa estrutura: seções numeradas, `FormDescription`, checklist lateral com `progressbar` (`:429`), prévia, recuperação de rascunho local e diálogo de alterações não salvas. Problemas:
  - A numeração quebra: 01 (`:247`), 02 (`:275`), uma seção **sem número** "Antes de participar" (`:347`) e depois 03 (`:366`). O checklist conta "3 etapas" (`:430`).
  - Os erros de banner ou foto vão só para toast (`:157,386,405`), sem mensagem perto do campo.
  - Três sistemas de controle na mesma tela: `DateRangePicker` do HeroUI (`:278`), `<select>` e `<input>` nativos com classes copiadas (`:269,300,307,312`) e `Input` do shadcn.
  - O checklist lateral não é navegável, porque os itens não levam até a seção.
- **Autenticação:** dois shells. Login e cadastro usam `LoginPageShell` com CSS Module (`components/MyComponents/LoginPageShell.tsx`). Recuperar senha, redefinir senha e confirmar e-mail usam `AuthPageShell` com Tailwind e outra apresentação (`components/MyComponents/AuthPageShell.tsx:8-36`). O usuário vê duas linguagens visuais dentro do mesmo fluxo. O texto "Sua conta foi banida do site" (`login-form.tsx:106`) é duro para um produto comercial.
- **Perfil** (`Profile/page.tsx`) é bem organizado em cards. O submit fica desabilitado sem alterações (`:248`), o que é bom.

### 3.7 Modais e diálogos

- HeroUI `Modal`: `CardEvents.tsx`, `ModalEventsValidate.tsx`, `ModalUniversal.tsx`, `UserTable.tsx`.
- Radix `Dialog`: 9 arquivos, entre eles `ConfirmAction.tsx`, `TableEventsAdmin.tsx:282`, `NotificationBell.tsx` e `ActivityDashboard.tsx`.
- `CardEvents.tsx` usa os dois. A ordem dos botões varia: `ModalUniversal.tsx:45-50` põe Confirmar antes de Cancelar, enquanto `TableEventsAdmin.tsx:288` põe Voltar antes da ação primária, que é o padrão correto. Os z-index são ajustados à mão (`z-[100]`, `z-[110]`, `z-[120]`, `z-[70]`).

### 3.8 Tabelas e Admin

- `UserTable.tsx` tem versão em cards para mobile (`:221-305`), paginação e confirmações, e é o melhor exemplo do admin.
- `TableEventsAdmin.tsx:226-275`: a tabela não tem data, promotor, categoria, ordenação nem paginação. Os botões são `Button color="primary"` do HeroUI com `Tooltip` redundante ("Ver Detalhes" sobre um botão "Detalhes"), e o rótulo está em inglês.
- Os resumos (`admin/page.tsx:113-117`, `SummaryCard`) mostram totais, mas não mostram o que o administrador precisa fazer: pendências, denúncias abertas, eventos importados aguardando revisão.

### 3.9 Gráficos e métricas

- **Resultados** (`resultados/page.tsx`): três `Metric` (visualizações, cliques, favoritos) e, por evento, sete barras de visualizações **sem eixo, datas nem valores visíveis** (`:31-33`). Não há conversão (cliques ÷ visualizações), comparação entre períodos, ranking nem exportação. O serviço já devolve **30 dias** de `views` **e** `ticketClicks` por dia (`lib/services/promoters.ts:67-68`), então a interface descarta 23 dias e a série inteira de cliques.
- **Meus eventos** (`myEvents/page.tsx:158-163`): três contadores com cores cruas (emerald/amber).
- Não há biblioteca de gráficos no `package.json`. A recomendação é **manter barras em CSS/SVG** (leve e sem dependência), com rótulos e uma tabela acessível alternativa.

### 3.10 Página pública do evento (`app/eventos/[id]/page.tsx`)

É a página de **conversão e SEO** (JSON-LD em `:39`, Open Graph em `:30`), e já tem boa estrutura: banner, H1, painel lateral com Quando/Onde, ações, comunidade, chat e conexões. Problemas:
- **Ruído:** a seção "Antes de participar" lista quatro campos e mostra "Não informado por quem publicou o evento." em cada campo vazio (`:40`, trecho `value || "Não informado…"`). Num evento importado, a página fica cheia de negativas.
- **O CTA primário se perde no mobile.** "Comprar ingresso" ou "Participar" fica dentro do `aside`, que no mobile aparece **depois** do banner e do título, e não há uma barra de ação fixa.
- O link de volta é fixo, "← Voltar à agenda" (`:40`), mesmo para quem chegou pelo mapa ou pela home.
- Os três links de comunidade, chat e conexões têm o mesmo peso visual que as ações de ingresso.
- A página não tem rodapé, Termos de Uso nem outros sinais de confiança.

### 3.11 Responsividade e tema

- A home mobile tem um bottom sheet com gesto, `Escape`, `aria-expanded` e safe-area (`app/page.tsx:143-149`, `discovery.module.css`), um trabalho de boa qualidade.
- O header colapsa abaixo de 1099 px e 639 px (`SiteHeader.module.css:22-23`) e mantém alvos de 44 px.
- O tema escuro é consistente graças aos tokens, e o mapa troca de estilo conforme o tema (`Map.tsx:293`). O risco são as cores cruas sem par `dark:`. A maioria tem par, mas `bg-amber-50` exige o `dark:` em cada uso, e um token resolveria isso de uma vez.
- Código morto que pesa na manutenção visual: `home/LoggedHomePresentation.tsx`, `home/LoggedHomeScrollScene.tsx`, `home/LuxuryHomeScrollScene.tsx`, `CustomLoading.tsx` e `components/ui/drawer.tsx` não são importados por nenhuma rota (verificado com `grep`).

---

## 4. Sistema visual proposto ("EventMap UI v1")

Tudo abaixo cabe em `app/globals.css`, `tailwind.config.ts` e `components/ui/`, sem nova dependência.

### 4.1 Papéis de cor

| Papel | Token | Uso |
|---|---|---|
| Ação primária | `--primary` (azul) | **Um** botão principal por tela: Salvar, Publicar, Comprar ingresso |
| Destaque de marca e conversão | `--cta` (lima) | Reservado à ação de conversão mais importante do produto ("Criar evento" para promotores, "Criar conta" para visitantes). **Não** marca o item ativo do menu |
| Item ativo do menu | `--sidebar-accent` + barra lateral em `--primary` | Substitui `data-[active=true]:bg-cta` em `app-sidebar.tsx:104` |
| Sucesso, aviso, informação | **novos** `--success`, `--warning`, `--info` (+ `-foreground`), em claro e escuro | Substituem emerald/amber/red crus. Mapear também `--heroui-success` e `--heroui-warning` em `globals.css:15-47` |
| Erro | `--destructive` (existente) | — |

### 4.2 Tipografia (classes utilitárias em `@layer components`)

- `.em-eyebrow`: `text-xs font-semibold uppercase tracking-[0.16em] text-brand`
- `.em-h1`: `text-3xl sm:text-4xl font-semibold tracking-tight`
- `.em-h2`: `text-xl font-semibold tracking-tight`
- `.em-lead`: `text-sm sm:text-base leading-6 text-muted-foreground max-w-2xl`

### 4.3 Primitivas novas em `components/ui/`

- `page-header.tsx`: eyebrow, título, descrição, slot de ações e breadcrumbs opcionais. Substitui os cabeçalhos ad hoc de CriarEvento, myEvents, resultados, Profile, admin e EventsCreated.
- `status-badge.tsx`: mapeia `EventStatus` (PENDING, PUBLISHED, CHANGES_REQUESTED, CANCELLED, ENDED, DRAFT) para tom, ícone e rótulo (`types/features.ts` → `eventStatusLabels`). O ícone garante que o status não dependa só de cor.
- `native-select.tsx`: o `<select>` com as classes de `Input`, para eliminar as cópias de `EventoForm.tsx`.
- `state.tsx`: `EmptyState`, `ErrorState` e `LoadingState` (com `Skeleton`) com ícone, título, texto e ação. Seguem os bons modelos de `myEvents/page.tsx:197-209` e `app/eventos/error.tsx`.
- `components/MyComponents/EventCard.tsx`: um card único com variantes `public | owner | admin`, banner com fallback, data, **preço** e **categoria**, além de `StatusBadge`.

### 4.4 Regras de componentes

- **Radix/shadcn como padrão** para Dialog, Sheet e Select. O HeroUI fica restrito a `DateRangePicker`, `Table` e `Checkbox`, que não têm equivalente pronto, e sempre com tokens mapeados.
- Ordem dos botões nos diálogos: secundário à esquerda e primário à direita. Ação destrutiva com `variant="destructive"` e confirmação.
- Z-index em escala nomeada (header 40, sheet 50, dialog 100, toast 120) definida como variáveis CSS.

---

## 5. Redesenhos prioritários (resumo)

1. **Shell de navegação:** sidebar fixa e recolhível em ícones (`collapsible="icon"`, já suportado em `components/ui/sidebar.tsx:180`) para usuários logados no desktop, com grupos Participar, Organizar e Administrar. Header com busca, sino e avatar com menu (Perfil, Tema, Privacidade, Sair). Ícones únicos por item. Privacidade sai para o menu do avatar e para o rodapé.
2. **Página do evento:** cabeçalho com data, local e preço em "chips" acima do H1. Barra de ação fixa no mobile (Ingresso/Participar, Salvar, Compartilhar). Campos vazios de "Antes de participar" ocultos. Comunidade, chat e conexões agrupados em "Depois de confirmar".
3. **Resultados:** faixa de KPIs com conversão. Série de 30 dias (visualizações e cliques) com eixo de datas e valores visíveis. Ranking dos eventos. Tabela alternativa acessível. Exportação em CSV no cliente.
4. **Console Admin:** `/admin` como painel com abas (Visão geral, Eventos para revisar, Usuários, Denúncias, Importados, Auditoria) e cards "o que fazer agora". A moderação sai de `/EventsCreated`.

---

## 6. Oportunidades priorizadas

| # | Prioridade | Título | Schema? | Credenciais? |
|---|---|---|---|---|
| UX-01 | P0 | Fundação do sistema visual: tokens de estado, papéis de cor e primitivas de composição | Não | Não |
| UX-02 | P0 | Estados globais: 404/erro em pt-BR, `loading.tsx` e skeletons | Não | Não |
| UX-03 | P0 | Arquitetura de navegação: sidebar persistente, ícones únicos, sino no header, rotas órfãs | Não | Não |
| UX-04 | P0 | Landmarks e acessibilidade: `main` único, rótulos em pt-BR, obrigatórios, erros inline no login | Não | Não |
| UX-05 | P0 | `EventCard` único com preço, categoria e status | Não | Não |
| UX-06 | P1 | Página do evento orientada a conversão | Não | Não (mapa estático opcional exige chave) |
| UX-07 | P1 | Painel Resultados com 30 dias, conversão e exportação | Não | Não |
| UX-08 | P1 | Console Admin coeso | Não | Não |
| UX-09 | P1 | Sistema de formulários: CriarEvento e autenticação unificados | Não | Não |
| UX-10 | P1 | Rodapé público, Termos de Uso e página "Para organizadores" | Não | Não |
| UX-11 | P2 | Consolidação de modais e diálogos | Não | Não |
| UX-12 | P2 | Tema "Sistema", limpeza de código morto e microcopy | Não | Não |

Os detalhes de cada item (problema, evidência, solução e arquivos) estão no retorno estruturado desta auditoria e resumidos abaixo.

### UX-01: Fundação do sistema visual (P0, M)
- **Problema:** não há tokens de sucesso e aviso, os dois primários (azul e lima) não têm papel definido, cada página refaz o cabeçalho e a documentação fala em "violeta".
- **Solução:** adicionar `--success`, `--warning` e `--info` (claro e escuro) em `globals.css` e `tailwind.config.ts`; mapear `--heroui-success` e `--heroui-warning`; criar `.em-eyebrow`, `.em-h1` etc.; criar `page-header.tsx` e `status-badge.tsx`; tirar o lima do item ativo da sidebar; corrigir `.codex/frontend-agent.md:7`.
- **Arquivos:** `app/globals.css`, `tailwind.config.ts`, `components/ui/page-header.tsx` (novo), `components/ui/status-badge.tsx` (novo), `components/ui/app-sidebar.tsx`, `.codex/frontend-agent.md`, e as páginas citadas em 3.1.

### UX-02: Estados globais (P0, S)
- `app/not-found.tsx` (pt-BR, busca e links para Agenda e Mapa), `app/error.tsx`, `app/global-error.tsx`, e `loading.tsx` em `app/eventos/[id]`, `app/promotores/[id]`, `app/(private)` e `app/(adminRoutes)/admin`. Substituir os carregamentos em texto por `Skeleton`. Corrigir o texto de `app/page.tsx:148`.

### UX-03: Arquitetura de navegação (P0, M)
- Sidebar em `collapsible="icon"` e aberta por padrão para usuários logados no desktop. Ícones únicos. Itens "Eventos para revisar" e "Auditoria" no grupo Administrar. Privacidade no menu do avatar e no rodapé. Sino dentro de `SiteHeader` em vez de `fixed`. Atalho "Criar evento" no header para promotores.

### UX-04: Landmarks e acessibilidade (P0, S)
- Trocar o `<main>` de `ClientProviders.tsx:33` por `<div>` e adicionar um link "Pular para o conteúdo". Traduzir os rótulos `sr-only` e `aria-label` em inglês. Corrigir `Required` em `EventoForm.tsx:444`. Mostrar erro inline e traduzido no login (mapear `CredentialsSignin`). Remover a espera de 1 s e manter o botão desabilitado até o redirecionamento.

### UX-05: `EventCard` único (P0, M)
- Um componente com variantes, usado em `TableEventsClient.tsx`, `CardEvents.tsx`, `app/(private)/salvos/page.tsx`, `app/promotores/[id]/page.tsx` e, quando possível, na home. Mostra preço, categoria e `StatusBadge`. Na Agenda, o vazio filtrado ganha botão "Limpar filtros".

### UX-06: Página do evento (P1, M)
- Chips de data, local e preço; barra de CTA fixa no mobile; ocultar campos vazios; "Voltar" com base no histórico; agrupar a área de comunidade; selo de "Fonte verificada" mais visível. Um mapa estático é opcional e depende da chave do Maps, que pode não existir.

### UX-07: Resultados (P1, M)
- Usar os 30 dias já retornados; calcular conversão (cliques ÷ visualizações); série dupla com eixo de datas; ranking; tabela acessível; CSV gerado no cliente. Sem nova dependência.

### UX-08: Console Admin (P1, L)
- Abas em `/admin`; cards de pendências; tabela de eventos com data, promotor, categoria, ordenação e paginação; botões e chips com tokens; rótulos em pt-BR; a moderação sai de `/EventsCreated`, mantendo a rota antiga funcionando.

### UX-09: Formulários e autenticação (P1, M)
- `NativeSelect`; numeração 01 a 04 coerente com o checklist; checklist clicável com âncoras; erros de imagem perto do campo; um único `AuthShell` para login, cadastro, recuperação, redefinição e confirmação; revisão de textos sensíveis.

### UX-10: Rodapé, Termos e "Para organizadores" (P1, M)
- `components/MyComponents/SiteFooter.tsx` nas páginas públicas (Privacidade, Termos, Para organizadores, Demonstração e contato). `app/(publicRoutes)/termos/page.tsx`, cujo texto jurídico precisa de validação humana. `app/organizadores/page.tsx`, com a proposta de valor para promotores (publicação, validação, métricas, check-in, comunidade) e CTA "Criar conta de organizador".

### UX-11: Modais (P2, M)
- Migrar `ModalUniversal`, `ModalEventsValidate` e os modais de `UserTable` e `CardEvents` para o `Dialog` do Radix e `ConfirmAction`; padronizar a ordem dos botões e uma escala de z-index.

### UX-12: Tema, limpeza e microcopy (P2, S)
- Opção "Sistema" (`enableSystem`, `defaultTheme="system"`) no `ThemeSwitcher`; remover os componentes mortos listados em 3.11; revisar os textos duros e a dica enganosa do sheet da home.

---

## 7. Limitações desta auditoria

- Não houve navegador nem captura de tela, então a sobreposição do sino com o composer do chat e a quebra visual exata em 390 px são **inferências do CSS** e precisam de conferência visual.
- As telas autenticadas (`/myEvents`, `/admin`, `/resultados`, `/Profile`) foram avaliadas **só pelo código**, porque o `curl` sem sessão é redirecionado para `/login`.
- O banco não foi consultado. Comentários sobre a densidade dos dados (eventos sem informações práticas, por exemplo) partem do código que trata valores vazios.
