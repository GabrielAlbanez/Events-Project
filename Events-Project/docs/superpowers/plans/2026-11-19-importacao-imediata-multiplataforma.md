# Importação imediata e multiplataforma: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Buscar agora" em `/admin/eventos-ia` busca na hora, na Sympla e na Ticket360, e cria os eventos como `PENDING` na fila normal de validação, com o selo "Importado de {plataforma}".

**Architecture:**
- Fontes de descoberta plugáveis em `lib/aiEvents/sources.ts`, consumidas por um descobridor com orçamento de tempo em `provider.ts`.
- Um pipeline único de importação em `service.ts`, usado pela ação imediata (route handler com `maxDuration`) e pelo worker horário. Ele cria `Events` (`PENDING`) mais o `AiEventCandidate` vinculado.
- A fila de validação existente (`/EventsCreated` → `TableEventsAdmin`) ganha o selo e o filtro de importados.

**Tech Stack:** Next.js 14 App Router, TypeScript estrito, Prisma/PostgreSQL, testes offline em `scripts/verify-*.cjs` (Node + transpile TS com mocks, padrão de `scripts/verify-ai-events.cjs`).

**Spec:** `docs/superpowers/specs/2026-11-19-importacao-imediata-multiplataforma-design.md`

## Global Constraints

- Sem mudança em `prisma/schema.prisma`, sem migração e sem dependência nova.
- Domínios permitidos continuam sendo só os de `AI_EVENT_SOURCE_DOMAINS`. Toda URL passa por `canonicalSourceUrl` e toda leitura pela `readOfficialSource` atual (proteção SSRF, 2 MB).
- Cidades: só `PUBLIC_EVENT_CITIES` (12). `publicCatalogUrl(city)` continua sendo a validação de cidade.
- Nenhum caminho cria evento `PUBLISHED`. Eventos importados nascem `status: "PENDING"`, `validate: false`, `userId` = admin que disparou. Nenhuma notificação de público na criação.
- `maxPerRun` continua entre 1 e 5. O orçamento total da busca imediata é de 45 s, com timeout por página de 8 s e no máximo 4 leituras simultâneas. A route usa `export const maxDuration = 60`.
- Rótulos de plataforma: `sympla.com.br`→"Sympla", `ticket360.com.br`→"Ticket360", `eventim.com.br`→"Eventim", `ingresse.com`→"Ingresse", `sescsp.org.br`→"Sesc SP"; outros → "fonte oficial". Selo: `Importado de ${label}`.
- Textos de UI em pt-BR, sem a palavra "IA" nos textos da tela (o título da rota pode continuar).
- Testes só offline. Nunca rodar `:db`/`:http` nem escrever no banco real.
- Sesc SP fica **fora deste plano**: o spec só o aceita se houver fonte pública estável, e isso exige investigação à parte. Ingresse e Eventim entram apenas por link colado.

## Review Focus

1. **Evento excluído pelo admin volta na próxima busca.** Esperado: o link com candidato `REJECTED` é ignorado como `previously_rejected` (teste na Task 3).
2. **Mesmo evento na Sympla e na Ticket360 na mesma busca** (nomes com acento ou caixa diferente, mesma data e cidade). Esperado: cria 1 e marca o outro `possible_duplicate` (teste na Task 3).
3. **Uma plataforma fora do ar ou que mudou o HTML.** Esperado: as outras seguem, `sourceErrors` tem a falha e a busca não lança erro (teste na Task 2).
4. **Busca que estoura o orçamento de tempo.** Esperado: devolve o que já criou com `partial: true`, nunca fica pendurada (teste na Task 2).
5. **Duplo clique ou duas abas buscando juntas.** Esperado: a unicidade de `sourceUrl` e o limite de 3 runs ativos impedem evento duplicado; o segundo clique recebe 429 ou conta "already_imported" (teste na Task 4).

---

### Task 1: Rótulos de plataforma e leitor de links da Ticket360

**Files:**
- Create: `lib/aiEvents/sources.ts`
- Test: `scripts/verify-ai-events-immediate.cjs` (novo; seção "sources")

**Interfaces:**
- Produces:
  - `export type PlatformId = "sympla" | "ticket360" | "eventim" | "ingresse" | "sescsp";`
  - `export function platformOf(sourceUrl: string): { id: PlatformId | null; label: string }` (label "fonte oficial" quando desconhecida ou URL inválida).
  - `export function importedBadge(sourceUrl: string): string` → `"Importado de " + label`.
  - `export function ticket360EventLinks(body: string): string[]`: URLs canônicas `https://www.ticket360.com.br/evento/{id}/{slug}`, únicas e na ordem de aparição, extraídas do HTML ou dos dados da página (inclusive com barras escapadas `\/`).
  - `export function sameCity(locality: string | undefined, region: string | undefined, city: string): boolean`: compara normalizado, sem acento e sem caixa. Aceita a cidade em `locality`; para "Brasília", aceita também `region` "DF".

- [ ] **Step 1: Write the failing tests**

```js
section("sources", () => {
  const s = load("lib/aiEvents/sources.ts");
  assert.deepEqual(s.platformOf("https://www.sympla.com.br/evento/x/1"), { id: "sympla", label: "Sympla" });
  assert.equal(s.platformOf("https://www.ticket360.com.br/evento/1/a").label, "Ticket360");
  assert.equal(s.platformOf("nao-e-url").label, "fonte oficial");
  assert.equal(s.importedBadge("https://www.ingresse.com/e"), "Importado de Ingresse");
  const html = fixture("ticket360-home.html"); // contém /evento/33222/ingressos-para-a, repetido, e "\/evento\/33514\/ingressos-para-b"
  assert.deepEqual(s.ticket360EventLinks(html), [
    "https://www.ticket360.com.br/evento/33222/ingressos-para-a",
    "https://www.ticket360.com.br/evento/33514/ingressos-para-b",
  ]);
  assert.equal(s.sameCity("São Paulo", "SP", "Sao Paulo"), true);
  assert.equal(s.sameCity("Campinas", "SP", "São Paulo"), false);
  assert.equal(s.sameCity(undefined, "DF", "Brasília"), true);
});
```

Fixture em `scripts/fixtures/ai-events/ticket360-home.html` (criar, mínimo: os dois links acima, um deles repetido, e um link `/busca?q=x` que deve ser ignorado).

- [ ] **Step 2: Run it and confirm it fails**

Run: `node scripts/verify-ai-events-immediate.cjs`
Expected: FAIL (módulo `lib/aiEvents/sources.ts` não existe)

- [ ] **Step 3: Implement `lib/aiEvents/sources.ts`** com as assinaturas acima. `ticket360EventLinks` usa regex sobre o texto com `\/` normalizado para `/`, e cada link passa por `canonicalSourceUrl` (importar de `./provider`; se isso criar ciclo de importação, mover `canonicalSourceUrl` para `sources.ts` e reexportar no provider).

- [ ] **Step 4: Run it and confirm it passes**

Run: `node scripts/verify-ai-events-immediate.cjs` → `PASS sources`

- [ ] **Step 5: Commit**

```bash
git add lib/aiEvents/sources.ts scripts/verify-ai-events-immediate.cjs scripts/fixtures/ai-events/
git commit -m "feat(importacao): rótulos de plataforma e leitor de links da Ticket360"
```

---

### Task 2: Descoberta multiplataforma com orçamento de tempo

**Files:**
- Modify: `lib/aiEvents/provider.ts` (`createAiEventProvider`, exports no fim do arquivo)
- Test: `scripts/verify-ai-events-immediate.cjs` (seção "discover")

**Interfaces:**
- Consumes: `ticket360EventLinks`, `sameCity`, `platformOf` (Task 1); `publicCatalogUrl`, `publicEventLinks`, `inspect` existentes.
- Produces:
  - `export interface DiscoveredSource { url: string; platform: string }` (platform = label)
  - `export interface DiscoveryResult { sources: DiscoveredSource[]; sourceErrors: { platform: string; message: string }[]; partial: boolean }`
  - No objeto do provider e como export nomeado: `discoverAllSources(city: string, max: number, options: { alreadyKnown?: (url: string) => Promise<boolean>; deadline: number; concurrency?: number }): Promise<DiscoveryResult>`.
  - `ProviderDependencies.readSource` passa a aceitar `(url: string, timeoutMs?: number)`. A leitura padrão usa `timeoutMs ?? 15000`; a descoberta imediata passa 8000.
  - `discoverEventSources` existente continua exportado (compatibilidade), implementado chamando `discoverAllSources` e devolvendo só as URLs.

- [ ] **Step 1: Write the failing tests** (provider criado com `readSource` falso e `now` fixo):
  - `discover.sympla+ticket360`: fixtures da Sympla (catálogo com 2 links) e da Ticket360 (home com 2 links; um evento com `addressLocality` "Campinas", outro "São Paulo"). Para `city = "Campinas"`, `max = 5` → `sources` tem 3 itens (2 Sympla + 1 Ticket360), o item da Ticket360 com `platform === "Ticket360"`.
  - `discover.source-down`: o `readSource` da home da Ticket360 lança erro → resultado tem os itens da Sympla e `sourceErrors` igual a `[{ platform: "Ticket360", message: <texto pt-BR> }]`, e a promessa **não** rejeita.
  - `discover.deadline`: `deadline = Date.now() + 50` e `readSource` que demora 200 ms → resolve com `partial === true` em menos de 1 s.
  - `discover.known`: `alreadyKnown` devolve `true` para um link → ele não aparece em `sources`.
  - `discover.max`: com 10 links verificáveis e `max = 2` → `sources.length === 2`.

- [ ] **Step 2: Run them and confirm they fail** → `node scripts/verify-ai-events-immediate.cjs` falha em `discover.*`.

- [ ] **Step 3: Implement `discoverAllSources`**: roda Sympla e Ticket360 em paralelo, cada uma isolada em try/catch (a falha vai para `sourceErrors`). Inspeção com no máximo `concurrency ?? 4` simultâneas, parando ao atingir `max` ou `deadline` (que marca `partial`). Na Ticket360, coletar links da home e de `/explore` e inspecionar no máximo 20 por busca, mantendo só os eventos onde `sameCity(location.address.addressLocality, addressRegion, city)`. A resposta intercala as plataformas (round-robin) antes de cortar em `max`, para uma não ocupar todas as vagas.

- [ ] **Step 4: Run them and confirm they pass**, e também `node scripts/verify-ai-event-sources.cjs` (deve continuar PASS).

- [ ] **Step 5: Commit** `feat(importacao): descoberta na Sympla e Ticket360 com orçamento de tempo`

---

### Task 3: Pipeline de importação que cria eventos pendentes

**Files:**
- Modify: `lib/aiEvents/service.ts`
- Test: `scripts/verify-ai-events-immediate.cjs` (seção "pipeline", Prisma em memória como em `verify-ai-events.cjs`)

**Interfaces:**
- Consumes: `DiscoveredSource` (Task 2), `validatedEvent`, `transaction`, `lock`, `admin`, `signalAdmins` existentes, `platformOf` (Task 1).
- Produces:
  - `export type ImportOutcome = "created" | "already_imported" | "previously_rejected" | "possible_duplicate" | "invalid" | "failed";`
  - `export interface ImportItem { url: string; platform: string; outcome: ImportOutcome; name?: string; eventId?: string }`
  - `export interface ImportReport { created: number; items: ImportItem[]; sourceErrors: { platform: string; message: string }[]; partial: boolean }`
  - `export async function importSources(db: PrismaClient, actorId: string, runId: string, sources: DiscoveredSource[], city: string | undefined, deps: AiEventsDependencies): Promise<ImportReport>` (sem `sourceErrors`/`partial`, que o chamador mescla).
  - Regras por URL, em ordem:
    1. já existe candidato com o `sourceUrl` → `already_imported`, ou `previously_rejected` se `status === "REJECTED"`;
    2. `inspect` e `validatedEvent`; erro de dados/passado → `invalid`; erro de leitura → `failed`;
    3. existe `Events` não `CANCELLED` com nome normalizado igual (mesma normalização de `normalized` em provider), mesmo dia de `dataInicio` e mesmo `endereco` contendo a cidade → `possible_duplicate`;
    4. numa transação com `lock`: `events.create({ ...data, userId: actorId, status: "PENDING", validate: false })`, `aiEventCandidate.create({ runId, sourceUrl, sourceHash, sourceVerifiedAt, name, startDate, address, data, status: "PENDING", eventId })`, `eventHistory.create({ action: "CREATED", note: "Importado de " + label })`, `signalAdmins`. Erro P2002 em `sourceUrl` → `already_imported`.
  - Nunca chama `notifyEventAudience`.

- [ ] **Step 1: Write the failing tests**:
  - `pipeline.creates-pending`: 1 fonte nova → `report.created === 1`; o evento salvo tem `status "PENDING"`, `validate false`, `userId === actorId`; o candidato tem `eventId` igual; o histórico tem a nota `"Importado de Sympla"`; o mock `notifyEventAudience` foi chamado 0 vezes.
  - `pipeline.rejected-not-reimported`: candidato existente `REJECTED` → item `previously_rejected` e nenhum evento criado.
  - `pipeline.cross-platform-duplicate`: duas fontes (Sympla "Show do Fulano" e Ticket360 "SHOW DO FULANO", mesma data e cidade) → 1 `created` e 1 `possible_duplicate`.
  - `pipeline.past-event`: fonte com data passada → `invalid`.
  - `pipeline.race`: `aiEventCandidate.create` lança P2002 → `already_imported`, sem exceção.

- [ ] **Step 2: Confirm they fail.**
- [ ] **Step 3: Implement `importSources`** conforme as regras acima.
- [ ] **Step 4: Confirm they pass**, e também `node scripts/verify-ai-events.cjs`. Ajustar nesse script só as asserções que assumiam proposta sem evento; não remover as de segurança.
- [ ] **Step 5: Commit** `feat(importacao): importados viram eventos pendentes sem publicação automática`

---

### Task 4: Busca imediata, colar link imediato e worker no mesmo pipeline

**Files:**
- Modify: `lib/aiEvents/service.ts` (`aiEventsAction`, `approve`, `pollAiEvents`)
- Modify: `app/api/admin/ai-events/route.ts`
- Test: `scripts/verify-ai-events-immediate.cjs` (seção "immediate"), `scripts/verify-ai-events-api.cjs`

**Interfaces:**
- Consumes: `discoverAllSources` (Task 2), `importSources`/`ImportReport` (Task 3).
- Produces:
  - `aiEventsAction(...)` passa a retornar `Promise<ImportReport | null>`: o relatório para `run` e `inspect`, `null` para as demais ações.
  - `run` e `inspect` executam **na mesma requisição**:
    1. checa admin, cidade e limites (10/h por admin; no máximo 3 runs `RUNNING` com `startedAt` nos últimos 10 min → 429 "Aguarde as buscas em andamento.");
    2. cria `AiEventRun` com `status: "RUNNING"`, `startedAt` e trigger `MANUAL`/`SOURCE`;
    3. `discoverAllSources(city, maxPerRun, { deadline: now + 45_000, alreadyKnown })` (para `inspect`, `sources = [{ url, platform }]`);
    4. `importSources`;
    5. fecha o run (`SUCCEEDED` se `created > 0` ou não houve erro de fonte; `PARTIAL` se `partial`; `FAILED` se todas as fontes falharam) com `createdCount` e uma `message` resumida em pt-BR.
  - `approve` (legado) cria o evento `PENDING` (não `PUBLISHED`), sem `VALIDATED` no histórico e sem notificação, e só para candidato `PENDING` com `eventId === null`.
  - `pollAiEvents`: só marca `FAILED` os runs `RUNNING` com `startedAt` anterior a `now - 10 min`; runs horários usam `discoverAllSources` + `importSources`.
  - Route `POST`: `export const maxDuration = 60;` e resposta `{ ...snapshot, report }` (`report` = retorno da ação ou `null`). `GET` sem mudança.

- [ ] **Step 1: Write the failing tests**:
  - `immediate.run`: `aiEventsAction(db, admin, { action: "run", city: "Campinas", maxPerRun: 3 }, deps)` resolve com um `ImportReport` contendo `created >= 1`; o run fica `SUCCEEDED` com `createdCount` igual; nada fica `QUEUED`.
  - `immediate.inspect`: `{ action: "inspect", url }` cria 1 evento `PENDING` e devolve um report com 1 item.
  - `immediate.concurrency`: 3 runs `RUNNING` recentes → 429; 3 runs `RUNNING` com `startedAt` de 11 min atrás → permitido.
  - `immediate.approve-legacy-pending`: `approve` cria `status "PENDING"`, e 0 chamadas a `notifyEventAudience`.
  - `immediate.worker-keeps-running`: `pollAiEvents` com um run `RUNNING` iniciado há 1 min → continua `RUNNING`.
  - Em `verify-ai-events-api.cjs`: o POST responde com a chave `report` e a route exporta `maxDuration === 60`.

- [ ] **Step 2: Confirm they fail.**
- [ ] **Step 3: Implement** as mudanças acima, reaproveitando `importSources` nos três caminhos (run, inspect, worker).
- [ ] **Step 4: Confirm they pass**, e também `npm run -s test:ai-events`.
- [ ] **Step 5: Commit** `feat(importacao): busca e verificação de link imediatas`

---

### Task 5: Status do candidato acompanha validação e exclusão

**Files:**
- Modify: `app/(actions)/validateEvents/action.ts`, `app/(actions)/deleteEvents/action.ts`
- Test: `scripts/verify-ai-events-immediate.cjs` (seção "lifecycle")

**Interfaces:**
- Produces:
  - Em `validateEvents`, na mesma transação da publicação: `aiEventCandidate.updateMany({ where: { eventId: { in: publishedIds } }, data: { status: "PUBLISHED", approvedBy: adminId, approvedAt: now } })`.
  - Em `deleteEvents`, **antes** do `events.deleteMany`, na mesma transação: `aiEventCandidate.updateMany({ where: { eventId: { in: ids } }, data: { status: "REJECTED" } })`.

- [ ] **Step 1: Write the failing tests** (fonte das actions carregada com Prisma em memória):
  - `lifecycle.validate`: validar um evento importado → candidato `PUBLISHED` com `approvedBy`.
  - `lifecycle.delete-before-cascade`: excluir → o `updateMany` do candidato acontece antes do `deleteMany` dos eventos (ordem registrada no mock), e o candidato fica `REJECTED`.
- [ ] **Step 2: Confirm they fail.**
- [ ] **Step 3: Implement** as duas mudanças.
- [ ] **Step 4: Confirm they pass**, e também `node scripts/verify-organizer-ops.cjs` e `npm run -s test:features`.
- [ ] **Step 5: Commit** `feat(importacao): candidato acompanha validação e exclusão do evento`

---

### Task 6: Tela de importação com "Buscar agora" e resumo

**Files:**
- Modify: `components/MyComponents/AdminAiEvents.tsx`
- Test: `scripts/verify-ai-events-immediate.cjs` (seção "ui", checagens estáticas), `scripts/verify-ai-events-realtime.cjs` (manter PASS)

**Interfaces:**
- Consumes: resposta `{ ...snapshot, report: ImportReport | null }` (Task 4), `importedBadge` (Task 1).
- Produces (textos exatos):
  - Botão: `Buscar agora em {cidade}`. Durante a busca: `Buscando em Sympla e Ticket360…` (com `aria-busy` e botão desabilitado).
  - Resumo (`role="status"`):
    - `{n} evento(s) criado(s) e aguardando validação`;
    - partes opcionais `· {n} já importado(s)`, `· {n} possível(is) duplicado(s)`, `· {n} sem dados suficientes`, `· {n} com falha`;
    - uma linha por plataforma (`Sympla: 3 · Ticket360: 2`);
    - avisos de `sourceErrors` (`Ticket360 indisponível agora`);
    - se `partial`: `A busca foi interrompida pelo tempo limite; rode de novo para continuar.`
  - Link `Validar agora →` para `/EventsCreated?importados=pendentes`, visível quando `created > 0`.
  - Lista "Eventos encontrados": cada item mostra o selo `importedBadge(sourceUrl)` e o status (`Aguardando validação` / `Publicado` / `Rejeitado`). O botão de aprovar legado só aparece em candidatos sem `eventId`.
  - Trocar textos com "IA" por "importação de fontes oficiais". O campo de colar link usa `Verificar e importar agora`.
- [ ] **Step 1: Write the failing static checks** (o arquivo contém os textos exatos acima, o href `/EventsCreated?importados=pendentes`, `aria-busy`, e não contém a palavra `IA` como palavra isolada).
- [ ] **Step 2: Confirm they fail.**
- [ ] **Step 3: Implement** seguindo `.codex/frontend-agent.md` (tokens existentes, 44 px, tema claro/escuro, 390 px).
- [ ] **Step 4: Confirm they pass**, e também `node scripts/verify-ai-events-realtime.cjs`, `npx next lint --file components/MyComponents/AdminAiEvents.tsx`.
- [ ] **Step 5: Commit** `feat(importacao): busca imediata com resumo na tela de importação`

---

### Task 7: Selo e filtro de importados na fila de validação

**Files:**
- Modify: `app/api/admin/events/route.ts`, `app/(publicRoutes)/EventsCreated/page.tsx`, `components/MyComponents/TableEventsAdmin.tsx`
- Test: `scripts/verify-ai-events-immediate.cjs` (seção "queue")

**Interfaces:**
- Consumes: `importedBadge` (Task 1).
- Produces:
  - A route de admin seleciona `aiImport: { select: { sourceUrl: true } }`. Se `publicEventSelect` já incluir, não duplicar.
  - `EventsCreated` lê `?importados=pendentes` (via `useSearchParams`) e, para admin, filtra `event.status === "PENDING" && event.aiImport`. O cabeçalho mostra `Importados aguardando validação` com um link `Ver todos` que remove o parâmetro.
  - `TableEventsAdmin` mostra o selo `importedBadge(event.aiImport.sourceUrl)` (componente `StatusBadge` existente ou tag discreta com texto) nos eventos com `aiImport`.
- [ ] **Step 1: Write the failing checks**: a route contém `aiImport` no select; a página lê `importados` e filtra por `aiImport`; a tabela chama `importedBadge`.
- [ ] **Step 2: Confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Confirm they pass**, e também `npx tsc --noEmit --incremental false`.
- [ ] **Step 5: Commit** `feat(importacao): selo e filtro de importados na fila de validação`

---

### Task 8: Ligar os testes e verificação final

**Files:**
- Modify: `package.json` (script `test:ai-events`), `scripts/run-offline-tests.cjs` (`OFFLINE_EXTRA`), `.claude/HANDOFF.md`

- [ ] **Step 1:** Acrescentar `node scripts/verify-ai-events-immediate.cjs` ao fim de `test:ai-events`. Não adicionar ao `OFFLINE_EXTRA` se já for executado via `test:ai-events`; o runner deduplica.
- [ ] **Step 2: Verificação completa.** Rodar e conferir:
  - `npx tsc --noEmit --incremental false` → exit 0;
  - `npx tsc --project tsconfig.server.json --noEmit` → exit 0;
  - `npm run -s lint` → "No ESLint warnings or errors";
  - `node scripts/run-offline-tests.cjs` → `FAIL 0`;
  - `npm run -s build` → exit 0.
- [ ] **Step 3: Smoke GET** com o dev server reiniciado: `/admin/eventos-ia` sem login → 307; `/EventsCreated?importados=pendentes` → 200. Não fazer POST no banco real.
- [ ] **Step 4: Commit e push** na branch `codex/produto-comercial-20261118`: `git push` normal, com o hash relatado ao usuário.
