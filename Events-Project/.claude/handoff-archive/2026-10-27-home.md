# HANDOFF — 2026-10-27 17:56 -03:00
## Tarefa original
“Melhore o design da hero (primeira seção) da home do EventMap, sem mudar a identidade visual atual (tema dark, roxo de destaque, tipografia grande e forte). Trabalhe só nesta seção e nos componentes que ela usa.”

“Deixar a hero mais equilibrada, mais viva e mais direta para o objetivo principal do app: achar um evento perto do usuário.”

O usuário também pediu verificar integralmente a troca de tema e preservar o mapa. Não fazer push sem pedido. A regra mais recente exige checkpoint automático e commit WIP sem push quando o contexto estiver acabando.
## Objetivo final / critério de pronto
Hero responsiva com busca ligada aos filtros existentes, carrossel de eventos reais, acessibilidade, animações básicas e reduced-motion. Tipagem, lint e build aprovados; revisar visualmente 390/768/1440, temas claro/escuro e estados com 0/1/2/6 eventos, informando limitações.
## Já concluído
- app/page.tsx — busca rápida aplica local, período e categoria usando o fluxo existente, atualiza URL e abre descoberta; removido link Agenda redundante no centro do header.
- components/MyComponents/home/LuxuryHomePresentation.tsx — integração da busca e carrossel com até cinco eventos existentes.
- components/MyComponents/home/HeroDiscovery.tsx — formulário e carrossel acessível, setas/dots/teclado, autoplay com pausa por foco, hover, aba oculta e reduced-motion; estados 0/1 sem controles desnecessários.
- components/MyComponents/home/HeroDiscovery.module.css — formulário responsivo, card maior, data evidente, endereço limitado, alvos de 44px e foco visível.
- components/MyComponents/home/LuxuryHome.module.css — duas colunas equilibradas, gradiente roxo discreto, contraste, tipografia, entrada suave e limpeza de estilos obsoletos.
- Commits finais da hero: ff4bee2 e d4fbb07. Alterações anteriores de simplificação e etapas 1–9 já estavam commitadas; etapa 10 do pedido inicial deixou de ser pertinente após remoção da galeria horizontal depth por solicitação posterior de simplificação.
- TypeScript, lint e build passaram. Build final repetido depois da limpeza CSS passou, com 32 páginas.
- Mapa real voltou a renderizar com configuração pública existente injetada no processo de build; nenhum código de mapa/API/autenticação/banco alterado nesta entrega.
- Testes visuais e de DOM anteriores à última limpeza CSS: larguras 320/390/768/1440 e desktop 1864; temas claro/escuro; 0/1/2/6 eventos sem overflow horizontal. Busca, URL, teclado, dots, pausa por foco e autoplay verificados. API real retornava um evento público; fixtures locais temporárias não gravaram eventos no banco.
## Estado atual
- Parei exatamente em: reconferência visual final em 390px/768px após a limpeza CSS. A ferramenta de viewport do navegador expirou duas vezes. Desktop final foi reconferido.
- Código está: compilando; TypeScript, lint e build aprovados; nenhuma alteração de código pendente no início deste checkpoint.
- Branch: feat/home-polish-eventos. Repositório correto: C:/Users/gabri/AppData/Local/Temp/eventmap-home-merge-main-20261027 (projeto em Events-Project/).
- ATENÇÃO: C:/Users/gabri/EventsApp/Events-Project é outro checkout, onde apenas foi criada feat/home-polish. Não implementar nem validar nele por engano.
- TaskUpdate não está disponível nas ferramentas deste ambiente. Retomada pendente registrada em .claude/TASKS.md.
## Próximos passos (em ordem)
1. Ler este HANDOFF antes de qualquer outra ação e confirmar brevemente a retomada.
2. Conferir git status no checkout correto; reler AGENTS.md e .codex/frontend-agent.md se houver implementação nova. Para frontend, delegar a subagente dedicado conforme AGENTS.md.
3. Reconferir visualmente a versão final em 390px e 768px nos dois temas. Verificar reduced-motion por emulação se a ferramenta permitir; isso ainda não foi emulado.
4. Se necessário, reativar proxy temporário de fixtures e repetir os estados 0/1/2/6; não criar dados fictícios no banco como se fossem reais.
5. Se houver correção, rodar npx tsc --noEmit --incremental false, npm run lint e npm run build; preservar a configuração pública do Maps no processo de build, sem imprimir segredos.
6. Entregar resultado honesto com arquivos, decisões e limitações; arquivar HANDOFF em .claude/handoff-archive/ e concluir tarefa local somente quando o trabalho estiver concluído. Não fazer push.
## Decisões tomadas e motivos
- Reutilizados filtros, cores, fontes e next/image existentes; nenhuma dependência nova.
- Um evento real disponível: carrossel mostra um slide, sem fabricar eventos. Fixtures de teste foram servidas somente por proxy local.
- Mapa funcional preservado; ausência de ambiente no checkout temporário era a causa do problema, não uma alteração na integração.
- Tema herda tokens existentes e foi inspecionado nos dois modos; sem auditoria WCAG completa.
- Contexto muito longo e saída de ferramenta explicitamente truncada por limite: pausa preventiva obrigatória, sem iniciar nova etapa.
## Arquivos relevantes
- app/page.tsx; app/discovery.module.css
- components/MyComponents/home/LuxuryHomePresentation.tsx
- components/MyComponents/home/LuxuryHome.module.css
- components/MyComponents/home/HeroDiscovery.tsx
- components/MyComponents/home/HeroDiscovery.module.css
- components/MyComponents/home/HomeEventImage.tsx
- lib/discoveryPeriod.ts; components/MyComponents/PublicEventFilters.tsx (localizar caminho real antes de editar)
- Screenshot final correto: C:/Users/gabri/.codex/visualizations/2026/10/27/01a17de3-e423-7952-badb-7521a49cb8a7/hero-eventmap-final.png
## Comandos para rodar/testar
Executar no diretório C:/Users/gabri/AppData/Local/Temp/eventmap-home-merge-main-20261027/Events-Project:
- npx tsc --noEmit --incremental false
- npm run lint
- npm run build
- Build com configuração pública Maps preservada: node C:/Users/gabri/.codex/visualizations/2026/10/27/01a17de3-e423-7952-badb-7521a49cb8a7/build-with-maps.cjs
- npm run start -- -p 3100 (servidor deixado ativo na sessão 79320; conferir antes de iniciar outro ou fazer build).
- Proxy de fixtures, atualmente parado: node C:/Users/gabri/.codex/visualizations/2026/10/27/01a17de3-e423-7952-badb-7521a49cb8a7/home-preview.cjs ; porta 3101 e ?__preview_count=0|1|2|6.
## Problemas em aberto / dúvidas
- Apenas reconferência visual final mobile/tablet e emulação de reduced-motion pendentes. Sem erro de compilação conhecido.
- Ferramenta CUA sofreu timeout ao mudar viewport. Usar getScreenshot({emit:false}); screenshot() produziu captura parcial/blank anteriormente.
- Checkout temporário não tem .env; nunca copiar/imprimir credenciais. Helper de build lê somente chave pública Maps já existente e injeta no processo sem registrá-la.
- Nenhum push realizado ou autorizado para esta entrega.
