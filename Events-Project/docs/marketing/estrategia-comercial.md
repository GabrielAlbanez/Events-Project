# EventMap — Estratégia comercial, marca e landing page

Data: 21/11/2026 · Branch: `claude/brave-euler-we7l2h` · Landing: `/produto`

Este documento reúne a auditoria comercial do produto, o posicionamento, a análise de naming, a estratégia de aquisição/monetização e o copy usado na landing page. Tudo que é descrito como **implementado** foi conferido no código deste repositório; o que é **sugestão** está marcado como tal.

---

## 1. Auditoria do produto

### O que é o EventMap (em uma frase)

> Uma plataforma que conecta a descoberta de eventos no mapa à experiência *durante* o evento — comunidade, chat, conexões entre participantes e check-in — para quem vai e para quem organiza.

### Inventário de funcionalidades (implementado e verificado no código)

| Área | Funcionalidade | Onde está | Valor comercial |
|---|---|---|---|
| Descoberta | Mapa interativo com clusters, lista sincronizada, busca, período (hoje / fim de semana / mês) | `app/page.tsx`, `Map.tsx` | Alto (B2C) |
| Descoberta | Filtros por categoria, gratuito, preço máximo, **raio a partir da sua localização** e **tempo de deslocamento** | `PublicEventFilters.tsx` | Alto — raro nos concorrentes |
| Descoberta | Agenda em lista e calendário; página pública do evento; exportação `.ics` | `EventsCreated`, `eventos/[id]`, `api/event-calendar` | Médio |
| Retenção | Favoritos, lembretes, notificações in-app e **Web Push**, recomendações por gosto e organizadores seguidos | `favorites.ts`, `recommendations.ts`, `PushSettings.tsx` | Alto |
| Social | Seguir organizadores; página pública do promotor | `promotores/[id]`, `promoters.ts` | Médio |
| Social | **Salas com amigos**: sugerir eventos e votar para decidir o rolê | `salas/`, `FriendsRoom*` | Alto — diferencial |
| Durante o evento | **Comunidade do evento**: comunicados oficiais, perguntas ao organizador, enquetes, programação, **filas virtuais**, equipe e tarefas, achados e perdidos, avaliação pós-evento | `CommunityEventHub.tsx`, `lib/community` | Muito alto (B2B) |
| Durante o evento | **Chat dos participantes** em tempo real (Socket.IO), com imagens, digitação e confirmação de leitura | `EventChatHub.tsx` | Alto |
| Durante o evento | **Conexões da festa**: perfil opt-in, curtidas, *match* e conversa privada, bloqueio e denúncia | `PartyConnectionsHub.tsx` | Alto (B2C) — diferencial forte |
| Organizador | Criar evento com rascunho e recuperação, duplicar, cancelar, **séries recorrentes** | `EventoForm.tsx`, `recurrence.ts` | Alto |
| Organizador | **Inscrição com capacidade e lista de espera automática**, QR de check-in assinado e leitura na porta | `attendance.ts`, `CheckInPass.tsx`, `myEvents/[id]/checkin` | Muito alto |
| Organizador | Painel de resultados: visualizações, cliques no ingresso, favoritos, série diária | `resultados/page.tsx` | Alto — base do plano pago |
| Plataforma | Moderação (validação de eventos, denúncias, suspensão, auditoria), **curadoria de eventos com IA a partir de fontes oficiais com aprovação humana** | `admin/*`, `lib/aiEvents` | Alto — resolve o "mapa vazio" |
| Plataforma | App mobile Expo/React Native com backend próprio, mesmo banco | `events-project-mobile/` | Alto |

### Pontos fracos comerciais encontrados

1. **Não existe onboarding de organizador self-service.** O cadastro cria conta `BASIC`; o papel `PROMOTER` é concedido por um administrador. Isso trava o funil B2B.
2. **Não há cobrança nem planos.** Todos os recursos estão liberados; não há billing, limites ou trial.
3. **O ingresso é externo** (`linkParaCompra`). Isso é uma força de posicionamento (não competimos com a bilheteria do organizador), mas significa que não há receita de taxa por ingresso hoje.
4. **O nome comunica só a primeira etapa** (o mapa), enquanto o maior valor está na experiência durante o evento.
5. **Prova social inexistente** (sem métricas públicas, depoimentos ou logos). A landing **não inventa números**; os espaços de prova social devem ser preenchidos com dados reais quando houver.
6. Dependências de infraestrutura apontadas na `AUDITORIA.md` (socket em plano gratuito com hibernação) afetam a promessa de "tempo real" — resolver antes de vender.

### Concorrência e posicionamento

- **Sympla, Eventbrite, Ingresse, Eventim.Light**: plataformas de *bilheteria* — a experiência termina quando o ingresso é vendido. A Sympla já oferece mapa de eventos no app, então **"mapa" sozinho não é diferencial**.
- **Fever, Shotgun**: curadoria/bilheteria B2C, foco em experiências próprias ou nightlife.
- **Grupos de WhatsApp/Instagram**: o "concorrente" real da comunicação durante o evento — sem moderação, sem fila, sem check-in, sem dados.

**Espaço livre:** a camada de engajamento *antes, durante e depois* do evento, independente de quem vende o ingresso. O EventMap pode ser **complementar** à bilheteria do organizador, não um substituto — o que reduz o atrito de venda.

---

## 2. Posicionamento

**Categoria:** plataforma de experiência de eventos (event experience platform).

**UVP (proposta única de valor):**
> **O EventMap leva as pessoas até o seu evento e as mantém conectadas quando chegam.** Descoberta no mapa, comunidade, chat, conexões e check-in em um só lugar — funciona com a bilheteria que você já usa.

**Mensagem para participantes (B2C):** *Descubra o que acontece perto de você — e chegue sabendo quem vai estar lá.*

**Mensagem para organizadores (B2B):** *Pare de gerenciar seu evento em cinco grupos de WhatsApp. Divulgue no mapa, controle a lotação, faça o check-in e fale com o público em um só painel.*

### Personas

| Persona | Quem é | Dor | O que compra/usa |
|---|---|---|---|
| **Marina, 27 — exploradora urbana** | Mora em capital, sai 2–4x por mês | Descobre eventos tarde, pelo feed; não sabe se vale o deslocamento; decide com amigos em grupo bagunçado | Mapa com tempo de deslocamento, salas com amigos, lembretes (gratuito) |
| **Rafael, 34 — produtor independente** | Festas, shows e feiras de 100–1.500 pessoas | Divulgação cara, lista de presença em planilha, público disperso em grupos, sem dados de interesse | Comunidade, filas, check-in QR, lista de espera, painel de resultados (plano pago) |
| **Camila, 41 — gestora de espaço/casa** | Bar, casa de shows, centro cultural com agenda recorrente | Agenda recorrente trabalhosa; público não volta | Séries recorrentes, seguidores, página do local, recomendações (plano pago) |
| **Prefeituras, festivais e marcas** | Agenda cultural, festivais com múltiplos palcos, ativações | Comunicar programação e avisos em tempo real para milhares | Comunicados, programação, filas, mapa (contrato/enterprise — sugestão) |

---

## 3. Naming e marca

### Análise crítica do nome "EventMap"

| Critério | Avaliação |
|---|---|
| Comercialmente forte? | **Médio-baixo.** Descritivo e genérico; difícil de registrar como marca (INPI tende a negar termos descritivos) e de diferenciar em busca. |
| Fácil de memorizar? | **Sim**, por ser literal — mas confundível com dezenas de "event map" existentes. |
| Comunica o propósito? | **Parcialmente.** Comunica a descoberta, mas esconde o diferencial (comunidade, conexões, check-in). |
| Potencial de marca? | **Limitado.** Não carrega emoção nem território próprio. |
| Brasil e internacional? | Em inglês, o que soa "tech" no Brasil, mas pronúncia mista ("ivent-map"); internacionalmente é genérico. |

### 12 alternativas

Notas de 1 a 5. **Disponibilidade de marca (INPI classes 9, 41, 42) e domínio não foram verificadas** — é pré-requisito antes de qualquer decisão.

| Nome | Ideia | Memor. | Pronúncia BR/intl | Identidade visual | Branding | Expansão | Observação |
|---|---|---|---|---|---|---|---|
| **Pulso** | O pulso da cidade, ao vivo | 5 | 5 / 4 (Pulse) | Onda/batimento sobre pin | 5 | 5 | Fala de "tempo real"; termo comum, checar conflitos |
| **Ondi** | "Onde" estilizado | 4 | 5 / 5 | Pin com "i" | 4 | 4 | Existe plataforma de delivery homônima pequena |
| **Rolê** | Gíria para sair | 5 | 5 / 2 | Tipografia expressiva | 5 | 2 | Excelente no Brasil, fraco fora |
| **Kairo** | *Kairós*, o momento certo | 4 | 4 / 5 | Relógio + pin | 4 | 5 | Pode lembrar "Cairo" |
| **Cena** | "A cena" da cidade | 4 | 5 / 3 | Palco, holofote | 4 | 4 | Ambíguo (refeição) |
| **Agito** | Gíria para movimento | 5 | 5 / 2 | Movimento, cor | 4 | 2 | Muito nightlife |
| **Fervo** | Festa animada | 5 | 5 / 1 | Neon | 3 | 1 | Restringe a festas |
| **Lumo** | Luz, brilho | 4 | 5 / 5 | Ponto de luz | 4 | 5 | Pouco significado próprio |
| **Órbita** | Pessoas orbitando o evento | 4 | 5 / 4 | Anéis | 4 | 4 | Acentuação complica domínio |
| **Vibra** | A vibe do lugar | 4 | 5 / 4 | Ondas sonoras | 3 | 4 | Muito usado no varejo |
| **Marco** | Ponto de referência no mapa | 3 | 5 / 4 | Pin/monólito | 3 | 4 | Confunde com nome próprio |
| **Bora** | "Vamos?" — CTA no nome | 5 | 5 / 4 | Balão + pin | 5 | 4 | **Espaço saturado** (Bora rewards, "Bora Marcar?") |

### TOP 3

1. **Pulso** — melhor equilíbrio entre Brasil e exterior, carrega a promessa de "ao vivo" e cobre toda a jornada (antes, durante, depois).
2. **Ondi** — herda o DNA do mapa ("onde"), curto, internacional, fácil de grafar.
3. **Rolê** — o mais emocional e memorável para o Brasil; ideal se a estratégia for 100% nacional e B2C.

### Recomendação

**Manter "EventMap" agora e não fazer o rebranding imediatamente.** Motivos: o produto ainda não tem receita nem tração mensurável, já está em produção com URLs, SEO e app mobile, e um rebranding hoje troca validação de mercado por trabalho de identidade.

O que fazer em vez disso:
1. **Reposicionar já** com a assinatura **"EventMap — a cidade ao vivo"** e a narrativa de experiência completa (feito na landing).
2. **Verificar INPI e domínios** do TOP 3 e testar os nomes com 20–30 pessoas das personas (teste de memorização em 24 h e associação espontânea).
3. **Decidir o rebranding antes de investir em mídia paga em escala** (meta: até o fim do primeiro ciclo de 10 organizadores pagantes). Se "Pulso" passar nas verificações, é a recomendação.

Nenhum nome, logo ou texto de identidade da aplicação foi alterado.

---

## 4. Monetização (estrutura proposta — sem valores)

Preços não estão definidos e **não foram inventados**. Estrutura recomendada:

| Plano | Para quem | Inclui (recursos que já existem) | Gatilho de upgrade |
|---|---|---|---|
| **Participante — grátis** | Público | Mapa, filtros, agenda, favoritos, lembretes, salas com amigos, chat, conexões | — |
| **Organizador Essencial — grátis** | Quem está começando | Publicar eventos validados no mapa, página do evento, agenda, métricas básicas | Lotação, check-in, comunidade |
| **Organizador Pro — assinatura mensal** | Produtores recorrentes | Inscrição com capacidade e lista de espera, check-in por QR, comunidade completa (filas, enquetes, equipe), chat, conexões, séries recorrentes, painel de resultados | Volume de eventos/participantes |
| **Espaços & Festivais — sob consulta** | Casas, festivais, prefeituras, marcas | Tudo do Pro + múltiplos eventos simultâneos, equipe, suporte dedicado (*sugestão*: multi-organização, API, white-label) | Contrato anual |

**Fontes de receita adicionais (sugestões):**
- **Destaque patrocinado no mapa e na agenda** (CPM/CPC) — o painel já mede visualizações e cliques.
- **Taxa por check-in** em eventos gratuitos com grande público (alternativa à assinatura).
- **Afiliação de ingressos**: comissão por clique/venda via parceria com bilheterias (o clique já é medido).
- **Dados agregados e anônimos** de demanda cultural por bairro para prefeituras e marcas (com LGPD e consentimento).

**Argumentos que justificam o investimento do organizador:**
- Substitui planilha de presença + grupos de WhatsApp + formulário de lista de espera + enquete solta.
- Reduz fila e no-show com lista de espera automática e QR.
- Público que segue o organizador recebe os próximos eventos — audiência própria, não alugada.
- Dados de interesse antes do evento para decidir divulgação e lotação.

---

## 5. Aquisição e go-to-market

### B2B (organizadores) — motor principal de receita

1. **Programa "Organizadores Fundadores"**: 10–20 produtores de uma cidade (São Paulo primeiro), plano Pro gratuito por 3 meses em troca de depoimento, caso de uso e feedback. CTA principal da landing.
2. **Venda consultiva com demo**: a demonstração interativa (`/produto#demo`) e a guiada (`/demonstracao`) servem como material de pré-venda.
3. **Conteúdo útil**: "checklist do dia do evento", "como reduzir fila na entrada", "modelo de comunicado de última hora" — capturam produtores por busca.
4. **Parcerias** com coletivos, casas de show, associações comerciais e secretarias de cultura (agenda cultural da cidade no mapa).
5. **Curadoria com IA** já implementada para manter o mapa cheio antes de os organizadores chegarem (resolve o problema do ovo e da galinha).

### B2C (participantes) — densidade e efeito de rede

1. **Densidade por cidade/bairro antes de expandir**: um mapa vazio mata a retenção.
2. **Loops virais nativos**: salas com amigos (cada sala traz convidados), conexões da festa, compartilhamento de evento.
3. **Redes sociais**: Reels/TikTok "o que fazer em SP neste fim de semana" gerado da própria agenda; carrosséis "3 eventos a 15 minutos de você"; criadores locais.
4. **SEO programático**: páginas por cidade/bairro/categoria/período ("eventos grátis em Pinheiros hoje") a partir do sitemap existente (*sugestão*).
5. **Push e lembretes** para reativação — já implementados.

### Métricas

- Norte B2C: **pessoas que fazem check-in por mês**.
- Norte B2B: **organizadores ativos com evento publicado no mês** e **receita recorrente**.
- Funil: visita → busca no mapa → favorito → inscrição → check-in → seguir organizador.

---

## 6. Roadmap para aumentar o potencial de venda (sugestões, não implementadas)

| Prioridade | Item | Por quê |
|---|---|---|
| P0 | **Onboarding self-service de organizador** (solicitar perfil de promotor com validação) | Desbloqueia o funil B2B |
| P0 | **Socket.IO sempre ativo** em produção | A promessa "ao vivo" depende disso |
| P0 | **Formulário de contato/lead** com destino definido (CRM ou e-mail comercial) | A landing hoje direciona para cadastro |
| P1 | Billing (assinatura) e limites por plano | Receita |
| P1 | Exportação de participantes (CSV) e relatório pós-evento | Pedido comum de produtores |
| P1 | Integração com bilheterias (webhook de venda → inscrição) | Elimina dupla digitação |
| P2 | Destaque patrocinado no mapa | Receita de mídia |
| P2 | Páginas SEO por cidade/categoria | Aquisição orgânica |
| P2 | Multi-organização e papéis de equipe ampliados | Venues e festivais |

---

## 7. Landing page `/produto` — decisões

- **Rota nova e pública** (`/produto`), sem alterar a home de descoberta (`/`) nem a demonstração guiada (`/demonstracao`).
- **Identidade preservada**: azul elétrico (`--primary`), lima (`--cta`), Geist, tema claro/escuro existente.
- **Demonstração interativa** em React/CSS, simulando uma pessoa usando o produto: mapa, eventos próximos, detalhes, salvar, inscrição, comunidade, chat e check-in. Dados fictícios e rotulados como simulação; não chama APIs.
- **Screenshots reais** da interface (página do evento e agenda) capturados localmente com dados fictícios.
- **Sem números inventados**: não há depoimentos, logos de clientes ou métricas de tração falsas.
- CTAs: *Explorar eventos* (`/`), *Ver a demonstração* (`#demo`), *Quero ser organizador fundador* (`/register`), *Demonstração guiada* (`/demonstracao`).
