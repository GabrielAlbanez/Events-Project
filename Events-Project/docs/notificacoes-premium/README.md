# Evidências de notificações premium

Capturas locais dos componentes reais da página e do sino, usando ações e sessão simuladas com dados fictícios. Não são capturas de produção nem comprovam entrega autenticada pelo Socket.IO.

As combinações 1440/390 e light/dark têm page (lista carregada e categorias), panel (diálogo aberto), empty (estado vazio) e undo (toast com Desfazer). Desktop foi rasterizado em 1280 px; mobile em 390 px. O fluxo de leitura e Desfazer foi acionado no Chromium. Nenhum pageerror ocorreu nas quatro combinações.

![Página clara](1440-light-page.png)
![Painel mobile escuro](390-dark-panel.png)
![Desfazer no celular](390-dark-undo.png)
![Estado vazio](1440-light-empty.png)

Limitações: harness local usa Next.js sem servidor Socket.IO e produz requisições de polling 404 do provider global; portanto não representa console de produção sem erros. CSP Report-Only não é emitida no desenvolvimento. Home/colisão de todos os controles fixos, banner recebido por socket, Lighthouse e entrega CDP de push ainda não foram validados nesta rodada.

`verify-notification-services.cjs` executa os seis serviços reais com persistência transacional em memória, sem mocks da criação/validação de notificações: inscrição, check-in, edição, denúncia, conexão e convite. Os cenários usam nome legado longo e vazio. Inscrição/check-in não criam notificação por si; o teste confirma que concluem e que os outros fluxos gravam notificações válidas. Não comprova concorrência/rollback no PostgreSQL real. Não foram alterados dados de produção.

## Validação antes da publicação

1. Em um ambiente isolado com PostgreSQL e Web Push configurados, aplique as migrações com `npx prisma migrate deploy`. Confira o preenchimento dos avisos antigos com `SYSTEM` e `normal`, o índice novo e a leitura da lista.
2. Com uma conta de teste em um dispositivo real, ative os avisos e solicite uma notificação de teste. Confira a entrega com a página fechada e com o dispositivo bloqueado. Gere também um convite e uma atualização de tarefa com dados fictícios. Ambos devem apresentar texto genérico no sistema e abrir o destino correto após a autenticação. Confira a leitura e o desfazer na central.
3. Confirme o banco de destino, a disponibilidade de backup e a janela de publicação. A migração `20261105180000_notifications_premium` é aditiva, mas cria um índice e pode bloquear escritas durante sua execução. Aplique as migrações aprovadas antes de publicar a versão web e o worker que consultam as novas colunas. Considere a publicação automática da Vercel ao planejar a ordem do merge.
4. Depois da publicação, valide a página, o sino, a entrega de push e os logs do worker. Se houver regressão, reverta o deploy da aplicação e do worker e mantenha as colunas aditivas enquanto investiga.

`verify-notification-push.cjs` verifica o conteúdo genérico de convites e tarefas de comunidade também para payloads de versões anteriores. O teste simula o service worker e não substitui o teste de entrega em dispositivo.
