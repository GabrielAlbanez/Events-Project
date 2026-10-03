# Chat e Conexões da festa

## Preparação

Esta implementação acrescenta migrações aditivas. As duas migrações foram aplicadas ao banco configurado após aprovação explícita do usuário. A leitura das sete tabelas novas foi conferida; o cliente Prisma foi regenerado para validar o código.

Migrações preparadas: `20261002080000_event_chat` (mensagens do chat) e `20261002090000_party_connections` (perfis, curtidas, matches, bloqueios, mensagens privadas e denúncias). Somam sete tabelas novas com índices e relações; não excluem nem convertem eventos ou contas existentes.

Com as migrações aplicadas, execute `npm run dev:socket` e abra `http://localhost:3000`. O servidor permanece parado ao final da tarefa.

## Chat do evento

`/eventos/[id]/chat` oferece conversa entre participantes humanos. Somente inscrições CONFIRMED/CHECKED_IN, organizador do evento e administrador têm acesso. A equipe não ganha acesso apenas por integrar a organização. Consultas, envios e assinaturas verificam a identidade atual no banco; inscrições revogadas perdem o acesso.

As mensagens têm até 1.000 caracteres. O limite inicial é 10 envios em 10 segundos e 60 por minuto por autor. Cada envio recebe um identificador do cliente; repetir o mesmo envio retorna sua confirmação sem duplicar a mensagem. Um identificador não pode ser reutilizado para outro texto.

O histórico usa páginas de 50 mensagens. Envios são serializados por evento antes de atribuir o número sequencial, e a sincronização do cliente mantém um cursor próprio separado das confirmações de envio. Isso evita pular mensagens em envios concorrentes. Sinais do Socket.IO transportam somente o nome do canal; o conteúdo é obtido por HTTP autenticado.

Se o resultado de um envio for incerto, a interface preserva a tentativa e permite repetir explicitamente com o mesmo identificador. Trocar de conta remove o histórico, cancela requisições e limpa assinaturas. Não há integração de IA paga.

## Testes manuais após autorização do banco

1. Entre como participante confirmado em janela normal e como outro participante confirmado em janela anônima. Abra o chat do mesmo evento.
2. Envie mensagens nas duas janelas; confira atualização, ordenação e histórico anterior.
3. Interrompa a rede durante um envio e reconecte. Confira o histórico e repita a mesma tentativa: deve existir apenas uma mensagem.
4. Remova a inscrição de uma conta, volte para sua janela e confira a revogação. Uma conta sem inscrição não deve consultar nem enviar, inclusive diretamente pela API.
5. Saia e entre com outra conta. O histórico anterior não pode persistir. Confira foco, leitura de mensagens antigas e layout mobile nos temas claro e escuro.

Testes automatizados com mocks verificam regras e comportamento do código, mas não substituem testes de concorrência real no PostgreSQL ou a inspeção visual no navegador.

## Conexões da festa

`/eventos/[id]/conexoes` é uma descoberta opcional e separada do perfil público. Cada participante escolhe nome, foto, bio curta, interesses e intenção. Somente participantes confirmados do mesmo evento que optaram por participar podem descobrir e curtir perfis.

As intenções de amizade e companhia são compatíveis entre si. Paquera exige que ambas as contas escolham essa intenção e declarem ser maiores de 18 anos. A declaração permanece privada e não equivale a verificação documental de identidade. Perfis de paquera não são mostrados a quem escolheu amizade ou companhia.

Curtidas não correspondidas e rejeições não são divulgadas. Somente um interesse mútuo cria um match e libera conversa entre as duas contas. Uma inscrição confirmada, uma função administrativa ou o link da conversa não dão acesso a mensagens privadas de outras pessoas.

Bloquear impede descoberta, curtidas e mensagens entre as contas. Sair da descoberta ou perder a inscrição revoga o acesso às conexões. Denúncias têm motivos predefinidos e podem incluir uma mensagem relacionada como evidência; a moderação recebe somente dados mínimos da denúncia, não o histórico completo das conversas.

O bloqueio vale entre as contas em todos os eventos. A saída mantém o registro privado de consentimento e o histórico armazenado, mas desativa os matches e seu acesso. Ao excluir uma conta ou evento, as relações em cascata removem os registros associados para não deixar histórico privado órfão. Remover um bloqueio não reabre automaticamente um match: novo interesse mútuo é necessário. Alterações de intenção também são verificadas ao acessar e distribuir mensagens.

### Conferência das conexões

1. Com duas contas confirmadas no mesmo evento, escolha participar e edite os perfis. Uma terceira conta sem inscrição ou participação não deve aparecer nem consultar os perfis.
2. Curta somente de um lado. A outra conta não deve receber a identidade de quem curtiu. Curta de volta e confira um único match, mesmo com repetição da ação.
3. Abra a conversa em ambas as contas. Outra conta, inclusive administrador, não deve ler nem enviar por essa conversa.
4. Bloqueie, saia da descoberta ou revogue a inscrição. Confira desaparecimento dos perfis/matches e recusa de acesso às mensagens.
5. Escolha paquera sem declarar maioridade: deve ser recusado. Perfis com amizade/companhia não devem receber perfis de paquera.
6. Envie uma denúncia e revise como administrador em `/admin/conexoes-denuncias`. Confira que só a evidência enviada está disponível, sem acesso automático às mensagens privadas.

### Testes automatizados

Execute `npm run test:event-chat` e `npm run test:party-connections`. Esses comandos verificam o código com persistência e conexões simuladas; nenhum deles aplica migrações ou inicia o servidor.

## Validação da implementação — 02/10/2026

Passaram os testes de chat, conexões, segurança, funcionalidades, comunidade e atividade; a tipagem da aplicação e do servidor; a validação do schema Prisma; lint e build de produção. O lint mantém um aviso preexistente em `app/api/resetPassword.ts`, e o build recomenda a dependência opcional `sharp`.

Os testes incluem troca de conta, revogação durante leitura de JSON atrasado, reconexão por cursor, deduplicação, autorização privada, bloqueios, maioridade declarada e evidência mínima nas denúncias. Banco real, concorrência no PostgreSQL e interação visual desktop/mobile não foram executados para estas duas etapas. As migrações foram posteriormente aprovadas e aplicadas; a leitura das sete tabelas foi conferida. Os testes de concorrência real e a inspeção visual continuam pendentes. O servidor não foi iniciado.
