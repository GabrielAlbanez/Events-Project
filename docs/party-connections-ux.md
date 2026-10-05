# Fotos, conexões e chat

## Fluxo

Na página do evento, abra **Conexões da festa**. Participantes CONFIRMED ou CHECKED_IN podem criar um perfil opcional exclusivo daquele evento. As etapas são foto, dados básicos, interesses e revisão. Somente **Criar perfil/Salvar perfil** envia o cadastro; avançar etapas, digitar ou recarregar não cria perfil.

A foto aceita JPG, PNG, WebP ou AVIF de até 5 MB. O navegador mostra uma prévia; o arquivo é enviado somente ao confirmar o perfil. O upload das conexões usa `/api/upload?purpose=party` e não substitui a foto da conta. O perfil da conta continua usando `/api/upload`, com confirmação, loading e retry.

**Conectar** envia interesse privado; **Pular** apenas avança a descoberta local. Interesse mútuo mostra a celebração e abre a conversa privada. Fechar a celebração cancela a navegação automática. Bloqueio, saída e revogação da inscrição continuam encerrando o acesso. Paquera continua exigindo declaração privada de maioridade.

## Persistência e tempo real

O endereço público `/uploads/<uuid>.<extensão>` é servido dinamicamente pelo handler `/api/media/[filename]`, incluindo arquivos criados depois do build. O handler limita tamanho, rejeita nomes arbitrários e symlinks. Os arquivos permanecem em `public/uploads`; o host precisa preservar esse diretório entre reinícios/deploys. Nenhum storage externo ou dependência foi adicionado.

Histórico e deduplicação continuam em PartyMessage. Metadados de digitação e recibos usam CommunityEntry com o tipo privado `party.receipt`; não são incluídos nas respostas da comunidade. **Não é necessária uma migração nova.** As tabelas de chat/conexões previamente existentes precisam estar disponíveis.

O servidor valida ambos os participantes antes de consultar e atualizar recibos. Administradores não ganham acesso às conversas privadas. Digitando expira em cinco segundos; atualizações ativas são limitadas. Recibos avançam sem retroceder: enviada significa persistida, entregue significa recebida pela interface, lida significa exibida na conversa visível. Contadores excluem mensagens próprias. Reconexão recupera o histórico existente.

Os servidores Socket.IO observam também sinais reconhecidos por outra instância, permitindo testes entre localhost e o túnel. A sincronização consulta sinais a cada segundo; não implica latência zero. Cada entrega continua revalidando sessão e autorização. Essa replicação é destinada ao modo atual de desenvolvimento/testes, com janela de 30 segundos e até 2.000 sinais recentes por consulta.

## Verificação

Execute `npm run dev:socket`, abra localhost:3000 e use duas contas em perfis de navegador distintos. Para acesso pelo túnel, siga `docs/cloudflare-preview.md`.

1. Troque a foto da conta, confirme e recarregue. Confira também após login OAuth, preservando a foto escolhida.
2. Avance o wizard sem salvar: nenhum perfil deve ser criado. Tente duplo clique no botão final.
3. Confirme participação das duas contas no mesmo evento, crie os perfis e conecte ambas. Interesse unilateral não abre conversa.
4. Envie mensagens, confira digitação, entregue/lida e não lidas na lista. Role o histórico para cima: mensagens novas não devem puxar a leitura para baixo.
5. Desconecte/reconecte; confira histórico e retry sem duplicação. Bloqueie, saia da descoberta ou revogue inscrição: acesso deve ser encerrado.
6. Confira mobile/desktop, temas, foco por teclado, Escape no diálogo e preferência de movimento reduzido.

Testes sem banco: `npm run test:party-connections`, `npm run test:event-chat`, `npm run test:community`, `npm run test:site-improvements`, `node scripts/verify-media.cjs` e `node scripts/verify-party-profile-client.cjs`.
