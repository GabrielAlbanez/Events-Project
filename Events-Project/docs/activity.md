# Central de atividades

## Acessar

Inicie com `npm run dev:socket`, entre pela tela de login e abra `http://localhost:3000/atividade`, ou use **Central de atividades** no menu.

A página reúne itens reais da conta: filas em que participa, tarefas pendentes atribuídas a você, próximas inscrições confirmadas e salas com amigos. Busca e filtros ajudam a encontrar a próxima ação; os cartões levam às páginas existentes para concluir cada atividade.

Os cartões também permitem **sair de uma fila**, **concluir uma tarefa** e **pedir ajuda** diretamente na central. Sair da fila exige confirmar a perda da posição; concluir uma tarefa exige confirmar sua finalização. Pedir ajuda fica disponível nas tarefas a fazer e avisa a organização pelo fluxo já existente.

As ações usam as APIs autenticadas da comunidade. Os botões ficam bloqueados offline ou durante um envio, e a página só confirma sucesso após a resposta do servidor. Um envio com resultado incerto não é repetido automaticamente: confira a atividade antes de reenviar. Trocar a conta cancela requisições pendentes e remove confirmações e mensagens da identidade anterior.

## Dados e permissões

`GET /api/community/activity` exige autenticação, consulta a identidade atual no banco e responde com `Cache-Control: no-store`. O serviço mantém as regras de acesso dos eventos e das salas. Não mostra tickets, tarefas ou inscrições de outras contas.

As listas são limitadas e informam quando há mais itens. Os números representam os itens exibidos, não totais de toda a conta. Não foram acrescentadas tabelas, dependências ou novas credenciais.

## Tempo real

Os sinais do Socket.IO pedem uma nova consulta HTTP; não transportam conteúdo privado. A central assina um conjunto limitado de canais autorizados para respeitar as cotas do servidor. Uma sincronização periódica com a página visível e a rede disponível também cobre itens novos ou fora desse conjunto.

Troca de conta, saída e desmontagem removem listeners e assinaturas da página. A interface informa conexão, sincronização, ausência de rede e falhas. Erros temporários preservam o último conteúdo da mesma conta; negação de acesso remove os dados.

## Conferência manual

1. Entre com duas contas em janela normal e anônima. Abra a central como participante e a comunidade como organizador.
2. Entre numa fila e chame o participante pela outra janela. Confira posição e indicação de chamada, sem recarregar. Uma fila fechada não deve orientar atendimento.
3. Atribua uma tarefa ao colaborador e depois conclua ou remova sua participação na equipe. Confira a atualização e remoção do item privado.
4. Convide a conta para uma sala e altere as sugestões. Confira a sala e os atalhos; uma conta de fora não deve acessar seus dados.
5. Use busca e filtros, teste teclado e larguras de celular/tablet/desktop nos temas claro e escuro.
6. Interrompa e recupere a conexão, depois saia e entre com outra conta. Dados da identidade anterior não devem persistir.
7. Use **Pedir ajuda**, **Concluir tarefa** e **Sair da fila**. Confira a atualização na segunda sessão. Cancele uma confirmação para verificar que nada foi enviado. Abra uma confirmação e troque de conta: ela deve fechar.

O servidor foi mantido parado durante a implementação. Testes automatizados não substituem essa conferência visual e entre navegadores.

## Verificações automatizadas

`npm run test:activity` verifica autorização, isolamento por conta, limites de consulta, datas, respostas sem cache e o hook real de tempo real com mocks determinísticos. Inclui limpeza no logout, ausência de consultas em segundo plano/offline, assinaturas estáveis e proteção contra confirmações atrasadas após cancelar ou revogar um canal.

`npm run test:activity:db` cria registros temporários isolados no banco configurado, verifica posição na fila, tarefas, inscrições, salas, isolamento entre contas e revogação da equipe. Remove os usuários temporários e seus registros associados ao final. Execute somente em um banco autorizado para testes.

Em 02/10/2026, passaram os testes isolados e de PostgreSQL, `npm run test:community`, `npm run test:features`, `npx tsc --noEmit --incremental false` e o build de produção. O lint passou com o aviso preexistente de exportação anônima em `app/api/resetPassword.ts`. O build também recomendou a dependência opcional `sharp`, que não foi acrescentada nesta etapa. Não há nova migração nesta funcionalidade.
