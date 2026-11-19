Status: PENDENTE
# HANDOFF — 2026-11-18 — Produto comercial
## Tarefa original
Missão "transformar o EventMap em produto comercial de alto valor": auditoria com 7 agentes (produto, UX/UI, front-end, back-end, IA, monetização, QA), priorização P0/P1/P2, implementação, validação, relatório final.
## Critério de pronto
Melhorias P0 e P1 selecionadas implementadas sem regressão; tsc, lint, build e suítes offline passando; commit e push na branch da tarefa; relatório final.
## Estado atual
- Worktree: C:/Users/gabri/AppData/Local/Temp/eventmap-main-20261118 (branch codex/produto-comercial-20261118, base origin/main 1f536cd).
- Base: tsc, lint e 12 suítes offline passando antes de qualquer mudança.
- Fase 1 (auditoria) concluída: 7 relatórios em docs/produto-comercial/ (84 oportunidades).
- Fase 2: 1ª rodada (wf_7dc31809-e83) caiu no limite de 5h em 19/11 ~04h; só G (CI + test:offline) concluiu. A–F deixaram trabalho parcial no disco (43 arquivos alterados + novos), não revisado.
- 19/11 08:50: A–F relançados como agentes avulsos (Workflow indisponível na sessão retomada) com instrução de retomar o parcial; prompts em C:/Users/gabri/EventsApp/painel-agentes/prompts/. Revisor de cada pacote a lançar quando o build terminar (review-*.md).
- Próximo: aplicar integration_notes (ClaimEventCta e SimilarEvents na página do evento, frame-ancestors /embed, scripts no package.json), validar tudo, build, commit e push.
## Decisões e motivos
- Sem mudança de schema Prisma neste ciclo (o banco do .env pode ser de produção; o mobile exige SQL equivalente).
- Nenhum script :db/:http; nenhuma escrita no banco.
- Não existe "skill da Meta" instalada; usar .codex/frontend-agent.md e as skills eventmap-* (zip do usuário).
## Como rodar e testar
npm run dev:socket; npx tsc --noEmit --incremental false; npm run lint; npm run build; npm run test:features etc. (ver eventmap-validate).
## Atualização 19/11 manhã
- Builds A–F concluídos (relatórios em C:/Users/gabri/EventsApp/painel-agentes/prompts/report-*.md).
- Revisões: B pronto-com-notas, D pronto-com-notas. Em revisão: A, C (+ aviso de promoção e troca dos testes de segurança), E (+ embed sem chrome, SiteFooter global, ClaimEventCta), F (+ react.cache seguro p/ loaders, verify-upload).
- Integração restante e testes a ajustar: painel-agentes/prompts/INTEGRACAO-pendente.md.
- Próximo: quando revisões terminarem → aplicar integração restante, reiniciar dev server, test:offline, tsc, lint, build, revisão do diff, commit/push, relatório final.

## Checkpoint 19/11 09:22 — limite de 5h atingido de novo (volta às 13:40)
- Revisões concluídas: A, B, D, E (todas "pronto com observações"; correções aplicadas por elas).
- Revisões INTERROMPIDAS pelo limite: C (segurança) e F (descoberta). Trabalho salvo; retomar enviando mensagem aos mesmos agentes (SendMessage) ou relançar com prompts/review-C-*.md e review-F-*.md + report-C/F-*.md.
  - C ainda devia: aviso de promoção em alterRoleUser (D) + mover scripts/security-platform-proposed/* sobre verify-account-security.cjs e verify-registration-security.cjs.
  - F ainda devia: react.cache seguro em lib/eventQueries.ts, investigar verify-upload ("Cannot find module @/lib/services/attendance").
- Integração feita pelo coordenador: contexto de comunicados em lib/community/events.ts; capa (banner) agora é mudança sensível (eventScheduleChanges + events.ts + EventoForm); testes atualizados e PASSANDO: verify-event-platform, verify-notifications, verify-notification-worker, verify-home-realtime, verify-portfolio-home, verify-agenda-complements. tsc 0 erros, lint ok.
- Falta (ordem): 1) terminar revisões C e F; 2) converter <main>→<div> nos 24 arquivos de PENDING_MAIN_CONVERSION (scripts/verify-frontend-foundation.cjs) e esvaziar a lista; HomeDiscoveryClient usa <section id="home-discovery" tabIndex={-1}>; login-form.tsx também tem <main>; 3) link "Fazer check-in" p/ equipe na comunidade; 4) SimilarEvents na página do evento (nota F4); 5) loading próprio para /myEvents/[id]/checkin; 6) reiniciar dev server; node scripts/run-offline-tests.cjs; tsc; tsc server; lint; npm run build; 7) revisar diff, commit e push na branch codex/produto-comercial-20261118; 8) relatório final (docs/produto-comercial/00-relatorio-final.md).
- Detalhes: C:/Users/gabri/EventsApp/painel-agentes/prompts/INTEGRACAO-pendente.md e report-*.md.
