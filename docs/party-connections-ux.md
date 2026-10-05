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

## Envio confiável e fotos nas conversas privadas

Enviar ou Enter confirma a mensagem; Shift+Enter adiciona uma linha. Em falhas transitórias, o cliente confere o histórico e tenta novamente até quatro vezes (1, 2,5, 5 e 10 segundos), sempre com o mesmo identificador. Uma resposta perdida não duplica a mensagem. Erros permanentes não entram em loop; texto e prévia são preservados para correção. Após esgotar as tentativas, **Tentar agora** permite repetir o envio. A transação privada tem timeout de 15 segundos e o cliente aguarda até 35 segundos, acomodando também a espera por conexão. O histórico continua sendo a fonte de verdade.

O botão de anexo aceita JPEG, PNG, WebP e AVIF de até 5 MB, com prévia e remoção antes do envio. Arquivos ficam em `.private-uploads/chat`, fora de `public/`, e metadados privados `party.image` usam a tabela CommunityEntry existente. **Nenhuma migração é necessária.** Preserve esse diretório no host; múltiplos hosts precisam compartilhar o mesmo armazenamento. Uma imagem sem mensagem só pode ser consultada pelo remetente durante 15 minutos. Imagens enviadas exigem uma sessão válida e acesso atual ao match em cada leitura, inclusive após bloqueio ou revogação. Uploads são limitados a seis por minuto por conta e validam assinatura e tamanho no servidor. Os metadados não aparecem na comunidade pública. Arquivos de prévias abandonadas permanecem no armazenamento; não há coleta automática nesta etapa.

O cabeçalho e as bolhas mostram a foto do perfil das conexões, com fallback para a foto da conta e depois iniciais. Falhas de carregamento também mostram iniciais. O evento Socket.IO `typing` revalida remetente e destinatário; expira em cinco segundos. O fallback HTTP e os sinais persistidos permitem sincronização entre localhost e o túnel, com a latência da consulta entre instâncias. `chat-sync` apenas solicita reconciliação autorizada: não transporta conteúdo de mensagens fornecido pelo cliente.

Para testar anexos, envie uma foto com e sem legenda, recarregue, abra a conversa na segunda conta e confirme o acesso. Após bloquear ou cancelar a inscrição, a URL da imagem deve negar acesso. Execute também `node scripts/verify-chat-images.cjs`; esse teste usa dependências simuladas e não substitui o teste entre duas sessões reais.
