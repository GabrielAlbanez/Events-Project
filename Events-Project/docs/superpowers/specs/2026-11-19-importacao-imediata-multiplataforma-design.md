# Importação imediata e multiplataforma de eventos (admin "Eventos IA")

Data: 2026-11-19 · Status: aguardando aprovação do design (cidades: opção A) · Tela: `/admin/eventos-ia`

## Intenção e porquê

O admin usa esta tela para trazer eventos de uma região de uma só vez, deixando-os criados e só aguardando validação. Hoje isso falha por três motivos:

1. **A busca não acontece ao clicar.** O botão só põe um pedido numa fila (`AiEventRun`). Quem processa a fila é `server/aiEventsWorker.mts`, que roda dentro do servidor Socket.IO e verifica a fila a cada 30 s. Em produção esse servidor fica separado da Vercel e pode estar hibernando, então os eventos aparecem tarde ou nunca.
2. **O resultado não vira evento.** Vira uma "proposta" (`AiEventCandidate`) que só existe nesta tela. Aprovar a proposta cria o evento já `PUBLISHED`.
3. **A descoberta só usa a Sympla.** As outras plataformas entram apenas quando alguém cola o link manualmente.

## O que o admin decidiu

- **Destino (opção A):** os eventos encontrados viram **eventos com status `PENDING`** e entram na fila normal de validação do admin (`/admin`, `TableEventsAdmin`), a mesma dos eventos criados por promotores.
- **Selo de origem:** cada evento importado mostra **"Importado de {plataforma}"**, com o nome da plataforma de onde veio (Sympla, Ticket360…), e não um texto fixo.
- **Fontes (opção 1):** um leitor de catálogo por plataforma, sem chaves de API nem custo. As plataformas que não expõem catálogo legível continuam entrando por link colado.
- **Imediato:** clicar em buscar executa a busca naquele momento e mostra o resultado na mesma tela.

## Objetivos

- Busca síncrona: o clique dispara leitura, verificação e criação, e a resposta já lista quantos eventos foram criados, ignorados (duplicados ou passados) e com falha, por plataforma.
- Descoberta nas plataformas viáveis, com eventos filtrados pela cidade escolhida a partir do endereço oficial no JSON-LD do evento.
- Eventos criados como `PENDING`, rastreáveis à fonte, sem duplicar (pelo `sourceUrl` canônico).
- Selo "Importado de {plataforma}" na fila de validação e na tela de importação.

## Fora do escopo

- IA/LLM, buscadores pagos (opções 2 e 3; a estrutura deve permitir plugá-las depois como mais uma fonte).
- Novas plataformas além das 5 já permitidas em `AI_EVENT_SOURCE_DOMAINS`.
- Mudar o schema Prisma.
- Mudar o fluxo de validação do admin.

## O que seria fracasso mesmo funcionando

- Evento publicado sem validação humana.
- Dados inventados ou "completados" sem estarem na página oficial.
- Duplicar eventos que já existem, seja do mesmo link, seja do mesmo evento já cadastrado por um promotor (ver Riscos).
- Clique que fica carregando sem fim ou estoura o limite de tempo da Vercel sem resposta útil.
- Contornar bloqueios anti-robô (a Eventim bloqueia; respeitar isso).

## Restrições

- Next.js 14 na Vercel: a execução imediata roda numa route handler ou server action com `export const maxDuration` dentro do limite do plano (assumir 60 s). A busca precisa de orçamento de tempo: concorrência limitada (ex.: 4 leituras simultâneas), timeout por página (o atual é de 15 s; reduzir para cerca de 8 s no modo imediato) e parada ao atingir `maxPerRun` ou o orçamento total (~45 s), devolvendo o resultado parcial.
- Reaproveitar o que existe: `canonicalSourceUrl`, `isPublicSourceAddress` e a leitura protegida contra SSRF em `provider.ts`, `parseOfficialEvent`/`parsePublicEvent` e `validatedEvent` em `service.ts`, além dos limites de taxa atuais (10 buscas/hora por admin, fila ≤ 3).
- Sem schema novo. O vínculo evento ↔ fonte continua via `AiEventCandidate` (`sourceUrl` único, `eventId` único, `data` Json, `status`). A plataforma é derivada do host do `sourceUrl`.
- O banco local pode ser o de produção: testes só offline, com mocks (padrão `scripts/verify-ai-event*.cjs`).
- Paridade mobile: o app não tem esta tela, mas o evento `PENDING` aparece para o mobile via o mesmo banco. Não há regra nova a replicar.

## Abordagens consideradas

| | Abordagem | Prós | Contras |
|---|---|---|---|
| **1 (escolhida)** | Um leitor de catálogo por plataforma | Grátis, determinístico, dados oficiais | Cobertura parcial e quebra se o site mudar o layout |
| 2 | Buscador (Google/Bing) restrito aos domínios | Alcança mais plataformas | Precisa de chave de API, tem custo e depende de indexação |
| 3 | Agente de IA com busca na web | Maior cobertura | Custo, lentidão e risco de dados errados |

O admin escolheu a 1 por resolver o uso diário sem custo, deixando a 2 ou a 3 como fontes plugáveis no futuro.

## Viabilidade por plataforma (sondagem de 19/11)

| Plataforma | Catálogo legível no servidor | Plano |
|---|---|---|
| Sympla | ✅ página por cidade `/eventos/{cidade-uf}` | Manter o leitor atual (`publicCatalogUrl`, 12 cidades) |
| Ticket360 | ✅ links `/evento/{id}/{slug}` nos dados da página inicial. As páginas de evento têm JSON-LD `*Event` completo, com endereço | Novo leitor: coletar links da home (e de `/explore` se tiver mais), abrir cada evento e manter só os da cidade escolhida |
| Sesc SP | ⚠️ programação montada por JavaScript, só SP | Investigar se há fonte de dados pública (JSON usado pelo próprio site). Se houver e for estável, criar leitor só para cidades de SP; se não, fica de fora e entra por link |
| Ingresse | ❌ página vazia sem JavaScript | Só por link colado |
| Eventim | ❌ bloqueia acesso automatizado | Só por link colado (se a página de evento também bloquear, mostrar erro claro) |

## Design

### Fontes plugáveis

Criar uma interface de fonte de descoberta em `lib/aiEvents/`, por exemplo `sources.ts`. Cada fonte informa:
- `id` e o rótulo público ("Sympla", "Ticket360", …);
- as cidades suportadas;
- `discover(city, max, deadline)`, que devolve URLs canônicas de páginas de evento.

O registro inicial tem `sympla` e `ticket360`, e mais `sescsp` se for viável. Opções 2 e 3 viriam depois como novas entradas.

**Cidades (decidido pelo admin: opção A).** A tela continua com as **12 cidades atuais** do catálogo da Sympla (`PUBLIC_EVENT_CITIES`), e `publicCatalogUrl` segue validando a cidade. Para cada cidade, a busca roda a Sympla e o leitor da Ticket360. A Ticket360 coleta os links em destaque (home e `/explore`), abre até ~20 páginas de evento dentro do orçamento de tempo e mantém só as que têm endereço (`addressLocality`/`addressRegion` normalizados) na cidade escolhida. Uma cidade pode receber zero eventos da Ticket360 numa busca; isso é esperado e aparece no resumo.

`platformLabel(sourceUrl)` faz um mapa host → rótulo para os 5 domínios. Domínio desconhecido vira "fonte oficial".

### Busca imediata

- Nova ação síncrona, por exemplo `importNow({ city, maxPerRun })`. Ela pode ser a ação `run` atual tornada síncrona, com `maxDuration` declarado. A ação:
  1. checa admin, limites de taxa e a cidade;
  2. registra um `AiEventRun` com trigger `MANUAL`, status `RUNNING` e `startedAt`, para manter o histórico em "Execuções recentes";
  3. roda as fontes em paralelo com orçamento de tempo, deduplica URLs e ignora as que já têm `AiEventCandidate`;
  4. para cada URL, até `maxPerRun` no total: lê, verifica, aplica `validatedEvent`, cria o evento e o candidato (ver abaixo);
  5. fecha o run com `SUCCEEDED`/`PARTIAL`/`FAILED`, `createdCount` e uma `message` resumida;
  6. devolve um relatório com totais e itens por plataforma.
- **Colar link (`inspect`)** também vira imediato, com o mesmo pipeline para uma URL só.
- **Busca automática por hora:** continua existindo pelo worker (ativação explícita). O worker passa a chamar o mesmo pipeline, para que os dois caminhos criem `PENDING` da mesma forma.

### Criação como pendente

- Numa transação por evento:
  - `events.create` com os dados validados, `status: "PENDING"`, `validate: false` e `userId` = admin que disparou. O dono continua sendo o admin, como hoje, para funcionar com "Sou o organizador" e a transferência de posse.
  - `aiEventCandidate.create` com `sourceUrl`, `sourceHash`, `data`, `status: "PENDING"` e `eventId` do evento criado.
  - `eventHistory` `CREATED` com nota "Importado de {plataforma}".
- Corrida e duplicata: a unicidade de `AiEventCandidate.sourceUrl` garante que não haja dois eventos do mesmo link. Um conflito vira "ignorado (já importado)".
- **Sem notificação de público na criação.** A notificação de "evento publicado" acontece na validação normal do admin, que já existe.
- A validação acontece no fluxo atual da fila de eventos (`TableEventsAdmin`, renderizada em `/EventsCreated`), pela ação `validateEvents`.
- Status do candidato *(decisão do coordenador, por segurança)*:
  - **validar** o evento → candidato `PUBLISHED`;
  - **excluir** o evento importado (`deleteEvents`) → candidato `REJECTED`. Isso é gravado antes da exclusão, porque a relação é `onDelete: SetNull` e, sem esse passo, o item voltaria a parecer uma proposta aprovável;
  - **"Pedir correção"** → candidato inalterado (o evento continua existindo).
- **Nenhum caminho publica direto.** O antigo `approve` da tela de importação passa a criar o evento como `PENDING`, igual ao pipeline novo, nunca `PUBLISHED`. Ele só aceita candidatos `PENDING` com `eventId = null` que nunca foram vinculados. Candidatos `REJECTED` nunca são reapresentados.
- Reimportar um link que já tem candidato `REJECTED` é ignorado ("rejeitado anteriormente"), para que um evento excluído não volte sozinho na próxima busca.

### Interface

- **`/admin/eventos-ia`:**
  - o botão principal passa a ser "Buscar agora em {cidade}", com estado de carregando e texto "Buscando em Sympla, Ticket360…";
  - ao terminar, mostra um resumo: "5 eventos criados e aguardando validação · 2 já importados · 1 sem dados suficientes", com detalhamento por plataforma e um link "Validar agora" que leva a `/EventsCreated?importados=pendentes` *(decisão do coordenador: é lá que fica a fila `TableEventsAdmin`; `/admin` é o painel de usuários)*. Esse filtro novo, lido da URL, mostra só os eventos `PENDING` com `aiImport`;
  - erros por fonte aparecem sem derrubar as outras ("Ticket360 indisponível agora");
  - a lista "Eventos encontrados" mostra os importados recentes com status (aguardando validação / publicado / rejeitado) e o selo da plataforma.
- **Fila de validação (`TableEventsAdmin` em `/EventsCreated`):** selo "Importado de {plataforma}" nos eventos com `aiImport`. Isso exige incluir `aiImport.sourceUrl` na consulta que alimenta essa tabela, que é a fonte de `/EventsCreated`.
- **Worker e runs imediatos** *(decisão do coordenador)*: hoje `pollAiEvents` marca como `FAILED` todo run `RUNNING` ao pegar o lease. Ele passa a marcar só os runs `RUNNING` com `startedAt` mais antigo que 10 min (travados), para não derrubar uma busca imediata em andamento. O limite "fila ≤ 3" passa a contar runs `RUNNING` iniciados nos últimos 10 min. Na prática, isso impede mais de 3 buscas simultâneas.
- **Textos honestos:** trocar menções a "IA" na tela por "importação de fontes oficiais". O título da rota pode continuar.

## Testes

- Offline (novo `scripts/verify-ai-events-immediate.cjs`, incluído em `test:ai-events` e no `OFFLINE_EXTRA`):
  - parser de links da Ticket360 com HTML de fixture;
  - filtro por cidade via JSON-LD;
  - `platformLabel`;
  - orçamento de tempo e resultado parcial;
  - deduplicação;
  - criação `PENDING` com candidato vinculado e nenhuma notificação;
  - conflito de `sourceUrl` vira "ignorado";
  - validar ou rejeitar atualiza o candidato.
- Atualizar `verify-ai-events*.cjs` que assumem "aprovar cria PUBLISHED".
- Sem testes que escrevam no banco real.

## Riscos e o que fica a critério de quem construir

- **Duplicata semântica:** o mesmo evento pode vir da Sympla e da Ticket360, ou já existir cadastrado por um promotor. Proposta mínima: antes de criar, procurar evento com o mesmo nome normalizado, mesma data de início e mesma cidade. Se achar, marcar como "possível duplicado" no relatório e **não criar**. Deixar visível para o admin.
- **Sesc SP:** decidir com base na investigação se entra ou não. Não inventar endpoint.
- **Tempo:** calibrar concorrência e timeouts para caber em 60 s, com margem.
- **Mudança de layout:** cada leitor deve falhar de forma isolada e visível, sem quebrar os outros.
- **Respeito às fontes:** User-Agent identificável, sem contornar bloqueios, volume baixo (`maxPerRun` atual).
