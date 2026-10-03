# Comunidade e colaboração em tempo real

## Iniciar

Instale as dependências com `npm ci`, gere o cliente com `npm run prisma:generate` e aplique as migrações aditivas com `npx prisma migrate deploy` no banco de desenvolvimento configurado. Inicie com:

```sh
npm run dev:socket
```

A aplicação e o Socket.IO usam `http://localhost:3000`. O login é manual. Para testar duas contas simultaneamente, use uma janela normal e uma anônima, ou perfis diferentes: guias do mesmo perfil compartilham a sessão.

## Recursos

O link **Comunidade** no evento reúne perguntas ao organizador, enquetes, programação, filas de atividades, equipe e tarefas, achados e perdidos e avaliação após o evento. As ações de gestão aparecem conforme as permissões devolvidas pelo servidor.

A seção **Comunicados** exibe avisos oficiais publicados pelo gestor do evento. O gestor pode arquivar um aviso: ele desaparece da visão dos participantes e permanece visível para gestão.

As filas têm três estados: **aberta** aceita participantes e permite chamadas; **pausada** interrompe novas entradas, mas permite atender quem já aguarda; **fechada** interrompe entradas e chamadas. Pausar ou fechar não apaga as posições, que podem ser retomadas ao reabrir a fila. Participantes podem sair mesmo com a fila fechada.

As respostas às perguntas geram um aviso privado para o autor quando o texto muda. Uma tarefa que passa ao estado **Preciso de ajuda** avisa o dono do evento. A confirmação de devolução de um objeto avisa quem fez a reivindicação. Esses avisos e os convites de salas são persistidos junto da mudança e acionam a central de notificações pelo canal pessoal; repetir uma ação sem mudança não duplica os avisos quando a regra prevê idempotência.

Em **Salas com amigos**, uma conta cria uma sala privada, adiciona membros cadastrados, sugere eventos e vota nas sugestões. Somente membros podem consultar a sala; seu endereço não concede acesso.

As mudanças são persistidas em PostgreSQL. As mensagens do Socket.IO contêm apenas avisos de atualização, e o navegador busca novamente os dados pelas APIs autenticadas. Respostas de reivindicações, detalhes de tarefas e dados pessoais não são transmitidos em canais públicos.

## Usabilidade das atualizações

As seções da comunidade mostram indicadores de mudanças desde a última leitura. A primeira consulta, reordenações e timestamps de transporte não geram novidades. Os indicadores são limitados e não equivalem a uma contagem completa de mensagens. A seção visível é marcada como lida; novidades em outras seções não mudam automaticamente a seleção.

Uma chamada pessoal na fila ou o início de uma atividade pode gerar um aviso na própria página, que pode ser dispensado. O aviso não altera o foco nem abre uma janela. Filas fechadas não orientam o participante a procurar atendimento. As salas de amigos também indicam mudanças nas sugestões e nos membros.

Falhas temporárias de atualização mantêm o último conteúdo e os formulários da mesma conta, com mensagem de erro e ação para tentar novamente. A última sincronização bem-sucedida fica visível. Sem rede, é possível continuar digitando; apenas o envio e as ações que dependem do servidor ficam indisponíveis. Os rascunhos ficam na tela: recarregar ou sair da página não os salva automaticamente.

Consultar dados tem timeout de 15 segundos; enviar uma alteração tem timeout de 30 segundos. Envios não são repetidos automaticamente. Se a conexão falhar após o envio, a página orienta verificar se a alteração foi salva antes de tentar novamente. Trocar conta, papel ou página cancela requisições antigas e limpa dados e indicadores associados à identidade anterior. Acesso negado ou recurso indisponível (401/403/404) limpa os dados, mesmo que houvesse conteúdo anterior.

## Roteiro de teste manual

1. Entre como organizador na janela normal e como participante na janela anônima. Abra a comunidade do mesmo evento publicado nas duas janelas.
2. Envie uma pergunta como participante e responda/destaque como organizador. Confira a atualização na outra janela sem recarregar.
3. Crie uma enquete e vote como participante. Confirme que o resultado muda e uma mesma conta não conta duas vezes.
4. Cadastre uma atividade na programação, edite o horário e altere seu estado. Confira as alterações na outra janela.
5. Crie uma fila, entre como participante e chame o próximo como organizador. Confira a posição e o aviso ao participante chamado.
6. Adicione um colaborador à equipe, atribua uma tarefa e altere seu estado usando a conta responsável. Uma conta de fora da equipe não deve ver tarefas privadas.
7. Publique um objeto encontrado e envie uma reivindicação como participante. Confira que só o autor e a equipe autorizada recebem seus detalhes.
8. Em um evento encerrado com presença confirmada, envie uma avaliação e confira o agregado na conta organizadora.
9. Crie uma sala de amigos, adicione a segunda conta, sugira um evento e vote. Uma terceira conta fora da sala deve receber acesso negado.
10. Saia da conta, entre com outra e confira que dados privados da conta anterior desaparecem. Interrompa e reconecte a rede: os dados devem ser buscados novamente após a reconexão.
11. Publique e arquive um comunicado. Confira o aviso na outra sessão e verifique que o participante não consegue publicar pela API.
12. Pause uma fila: novas entradas devem ser recusadas, enquanto a equipe ainda pode chamar os participantes existentes. Feche a fila e confira que chamadas são bloqueadas. Reabra e verifique que as posições foram preservadas.
13. Responda uma pergunta, peça ajuda em uma tarefa e confirme uma devolução. Confira o aviso somente na conta destinatária. Reenvie a mesma resposta e confirme que não gera outro aviso.
14. Deixe uma seção aberta e altere outra na segunda sessão. Confira seu indicador de novidades e abra a seção para marcar como lida. A seleção atual não deve mudar sozinha.
15. Digite uma resposta, interrompa a rede e tente sincronizar. O texto deve permanecer. Recupere a rede e confira a atualização sem perder o formulário. Uma revogação de acesso deve remover o conteúdo privado.
16. Entre numa fila e chame o participante pela segunda conta. Confira o aviso na página sem mudança de foco. Atualizar os mesmos dados não deve repetir o aviso.

As APIs aplicam as regras de acesso independentemente dos botões exibidos. Recursos existentes de descoberta, inscrição, check-in e revisão de eventos continuam nas rotas originais.

## Verificações automatizadas

`npm run test:community` verifica validação, permissões de salas Socket.IO, worker, detecção de novidades e o hook real de dados com mocks determinísticos, sem conexão ao banco. Esses testes não substituem a inspeção da interface em um navegador.

`npm run test:community:db` usa o banco configurado, cria usuários e eventos temporários, testa persistência, concorrência e privacidade e remove os registros ao final. Execute em um banco de desenvolvimento com a migração aplicada. Nenhum dos comandos inicia o servidor.

O worker atual pressupõe uma única instância do servidor Socket.IO. Para distribuir a aplicação entre várias instâncias, será necessário um adapter/pubsub e confirmação dos avisos por consumidor; um mesmo aviso deve alcançar clientes conectados em todas as instâncias.

As avaliações individuais e seus comentários ficam restritos ao autor e ao gestor do evento. A equipe pode consultar os indicadores agregados. Reivindicações de objetos ficam restritas ao autor e à equipe autorizada.

Os limites iniciais são 20 salas por criador, 50 membros por sala/equipe, 100 sugestões por sala e 100 itens por categoria na comunidade. Uma fila comporta até 500 pessoas aguardando. O worker verifica avisos pendentes a cada dois segundos, processa lotes limitados e mantém avisos que falharam para uma nova tentativa. Esse intervalo não é garantia de prazo de entrega sob carga.

A página informa conexão autorizada, tentativa de conexão, acesso negado, falha ou atualização em andamento. A confirmação de assinatura tem timeout de quatro segundos. Ao voltar para a janela, recuperar a rede ou reconectar o Socket.IO, os dados são consultados novamente. Se o tempo real estiver indisponível, há atualização periódica a cada 30 segundos somente com a página visível e a rede disponível; acesso negado não causa tentativas periódicas. Atualizações próximas são agrupadas para evitar consultas duplicadas.

Esta etapa acrescentou comunicados e controles de filas usando o JSON já presente em `CommunityEntry`; não criou uma nova migração. A migração da comunidade anterior continua sendo necessária para usar os recursos.

## Validação desta implementação

Executados com sucesso: build de produção, lint (com aviso preexistente em `app/api/resetPassword.ts`), TypeScript da aplicação e do servidor, testes isolados de comunidade, testes de segurança existentes e testes de funcionalidades existentes. As verificações isoladas incluem revogação de papel, privacidade de comentários, fusos, contagem de votos/filas e recuperação dos sinais do Socket.IO.

A migração `20261001120000_event_community` foi aplicada ao banco configurado em 02/10/2026, após autorização do usuário. `prisma migrate status` confirmou todas as migrações aplicadas e o Prisma Client foi regenerado. `npm run test:community:db` passou: persistência de salas, permissões, votos concorrentes, avanço de filas, notificações, revogação de equipe, programação, privacidade de reivindicações e avaliações de participantes. Os registros temporários foram removidos ao final. A compilação do servidor Socket.IO também passou.

Não foram executados testes visuais em desktop/mobile ou entre dois navegadores; o servidor foi mantido parado por solicitação do usuário. Para iniciar localmente neste ambiente já preparado, execute `npm run dev:socket` e abra `http://localhost:3000`.
