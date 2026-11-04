# HANDOFF — 2026-11-04
## Tarefa original
“ok faça tudo isto” — executar o plano para validar, publicar e apresentar o EventMap no portfólio.
## Objetivo final / critério de pronto
Validar com duas contas e no mobile, integrar a busca inicial e a sidebar à main, publicar uma prévia com banco persistente e WebSocket e gravar a demonstração.
## Já concluído
- AdminAiEvents.tsx, service.ts e verify-ai-events.cjs — busca inicial imediata após ativação e intervalo de uma hora nas execuções seguintes.
- app-sidebar.tsx — destaque verde-lima para navegação e novo evento.
- docs/validacao-e-publicacao.md — roteiro de deploy e demonstração.
- Build, testes do importador e de reconexão e TypeScript do servidor passaram.
## Estado atual
- Parei exatamente em: verificar o processo na porta 3100 após tentar reiniciar com a compilação nova. A ferramenta truncou a saída por limite de contexto.
- Código está: compilando. Smoke HTTP retornou 500 no servidor anterior, em vez do 403 esperado. A origem do 500 precisa de confirmação.
- Tarefa: PENDENTE. Retomar: validação e publicação do EventMap.
## Próximos passos (em ordem)
1. Verificar a porta 3100 e repetir o smoke HTTP autenticado com a nova compilação.
2. Validar aprovação e notificação no banco de testes e no navegador. Revisar mobile e os dois temas.
3. Validar o diff, conferir origin/main, integrar e confirmar o push autorizado.
4. Configurar prévia em hospedagem disponível com Node persistente e banco isolado, validar reinício e WebSocket, gravar demo e entregar link.
## Decisões tomadas e motivos
Usar o checkout canônico em C:/Users/gabri/EventsApp/repository/Events-Project. Publicação exige aprovação individual. A prévia precisa manter o processo ativo para executar a busca por hora.
## Arquivos relevantes
components/MyComponents/AdminAiEvents.tsx, components/ui/app-sidebar.tsx, lib/aiEvents/service.ts, scripts/verify-ai-events.cjs, docs/validacao-e-publicacao.md.
## Comandos para rodar/testar
npm run test:ai-events; npm run test:realtime; npm run test:features:http com FEATURE_HTTP_URL=http://127.0.0.1:3100; npm run test:ai-events:db apenas no banco de testes; npm run lint; npx tsc --noEmit --incremental false; npx tsc --project tsconfig.server.json; npm run build.
## Problemas em aberto / dúvidas
Sem hospedagem conectada para a prévia. Smoke autenticado, QA mobile, publicação e gravação pendentes.

## Atualização da retomada — 2026-11-04
- Smoke HTTP autenticado, aprovação no PostgreSQL com rollback, lint e TypeScript passaram. Sidebar alternou os dois temas a 390 px sem overflow horizontal.
- GitHub confirmou main em 54d5c18.
- Destino escolhido para a prévia: Vercel. A aba está na tela de login do GitHub, aguardando o usuário. Depois, importar o repositório e configurar um banco separado para a prévia. Adaptação do Socket.IO, agendamento e gravação seguem pendentes.

## Deploy Vercel — 2026-11-04
- Projeto events-project, banco isolado eventmap-preview-db, DATABASE_URL sensível e NEXTAUTH_SECRET próprio.
- Deploy da main 54d5c18 ficou Ready. Migrações passaram e home e tela de login abriram em https://events-project-lake.vercel.app.
- Código e banco locais preservados. Pendentes: eventos na prévia, login completo, Maps, Socket.IO, agendamento e gravação.

## Validação pública — 2026-11-04
- A home exibe 0 eventos e informa ausência da chave Maps. A página /demonstracao abre com três eventos fictícios próprios, sem gravar dados no banco.
- /api/auth/providers lista credenciais e Google. A tentativa pelo botão Google não chegou ao domínio do Google, e o login completo permanece pendente.
- /socket.io retorna 404 no deploy Next.js. Os workers iniciam em server.mts. Vercel Hobby aceita Cron apenas diário.
- Retomar com configuração Google (cliente OAuth e chave Maps para o domínio público), conta de demonstração no banco isolado e destino para o Node persistente ou adaptação do transporte e agendamento. Validar com duas contas e gravar após a prévia completa.
