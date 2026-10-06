# Chat com experiência de WhatsApp Web

## Antes e depois

O chat existente já mantinha histórico HTTP autorizado, envio otimista, UUID idempotente, reconciliação/retry, imagens privadas, digitação e recibos persistentes. A interface era um cartão isolado, com textarea fixo e sem lista lateral. Esses fluxos de dados continuam em `useEventChat`; a refatoração separa sua apresentação.

## Arquivos

- `components/MyComponents/EventChatHub.tsx`: integra componentes, acompanha a intenção real de rolagem, preserva rascunho/retry/anexos e reavalia leitura de balões virtualizados.
- `components/MyComponents/PartyConversation.tsx`: lista de matches autorizados do evento, ordenação por última mensagem, atualização da lista por Socket.IO e presença do interlocutor.
- `components/MyComponents/chat/ChatList.tsx`: busca, avatar, prévia, horário e contador fornecido pelo servidor.
- `components/MyComponents/chat/ChatHeader.tsx`: identidade, digitação, presença real ou estado de conexão, atualização e retorno à lista no celular.
- `components/MyComponents/chat/MessageInput.tsx`: textarea expansível até 120 px, Enter/Shift+Enter/IME, foco, emojis, fotos e aviso sobre áudio.
- `components/MyComponents/chat/MessageBubble.tsx`: balões memoizados, agrupamento, datas Hoje/Ontem, avatares, recibos e retry. Movimento reduzido desativa deslocamento/entrada.
- `components/MyComponents/chat/MessageList.tsx` e `messageWindow.ts`: janela medida acima de 200 mensagens, overscan e espaçadores. Salto instantâneo em históricos virtualizados evita cancelamento da rolagem por ajustes de altura; históricos curtos usam rolagem suave.
- `components/MyComponents/chat/Chat.module.css`: tokens de cores WhatsApp, estilos encapsulados claro/escuro e layout responsivo.
- `types/partyConnections.ts` e `lib/partyConnections/snapshot.ts`: campos opcionais de data/prévia; duas consultas em lote buscam no máximo uma mensagem por match autorizado. Prévia limitada a 160 caracteres; sem emails ou histórico integral.
- `hooks/useMatchPresence.ts`, `server/chatSignals.mts` e `server.mts`: consulta privada de presença, autorizada no servidor, com isolamento de conta, timeout e limpeza. Presença compartilhada entre os servidores locais existentes; atualizada por consulta a cada 5 segundos.
- `scripts/verify-chat-view-client.cjs`, `verify-chat-components.cjs`, `verify-match-presence.cjs`, `verify-party-connections.cjs`, `verify-party-socket.cjs`: regressões de interface, envio, rolagem, virtualização e acesso. Os testes novos entram em `npm run test:event-chat`.

## Configuração e limites

Nenhuma biblioteca ou migração nova. Execute `npm run dev:socket` para desenvolver com realtime. A lista privada continua restrita aos matches do mesmo evento; o chat coletivo mostra sua conversa de evento.

Microfone aparece sem texto e informa que mensagens de voz ainda não estão disponíveis. Gravação/reprodução exigiriam armazenamento privado, validação de áudio, autorização e extensão do contrato; não são simuladas.

Imagens continuam usando o armazenamento privado existente: mantenha `.private-uploads/chat` persistente. Presença compartilhada localhost/túnel usa o mecanismo local existente; servidores em máquinas distintas exigiriam infraestrutura compartilhada.

Mensagem local aparece antes da resposta HTTP. Os checks só avançam após confirmação real; latência de rede/servidor não é eliminada. Erros transitórios mantêm UUID e bubble para retry; erros permanentes preservam a recuperação de rascunho existente.

## Validação visual executada

Revisão com os componentes reais e dados locais descartáveis, sem escrever no banco: desktop 1280×720/800, celular 390×844 e 320×640; claro/escuro; Enter, Shift+Enter, emoji, busca e retorno lista/conversa; histórico de 300 mensagens, acompanhamento do fim, leitura antiga e salto por contador. Carregamento limpo sem erros/avisos de console após estabilizar a implementação. Página temporária removida antes do build.

As sessões de navegador disponíveis haviam expirado. Não foi executado nesta entrega um teste real entre duas contas autenticadas nem com teclado virtual físico do Safari. Autorização, recibos, retry, presença, reconexão e anexos foram verificados com testes que executam código real e dependências simuladas.

Validação final: TypeScript da aplicação e servidor, lint sem avisos, build de produção, `npm run test:event-chat` e `npm run test:party-connections` passaram. O build reportou First Load JS de 188 kB para chat coletivo e 205 kB para chat privado; não foi medida uma comparação de FPS nem latência real entre contas.

## Conferência manual

1. Abra um match em duas contas participantes; teste mensagens, fotos, digitação e evolução dos checks.
2. Confirme presença entre localhost e o túnel atual, aguardando o intervalo de atualização.
3. Leia mensagens antigas enquanto a outra conta envia; confira contador e salto.
4. Desconecte/reconecte a rede, repita um envio e confirme ausência de duplicações.
5. Bloqueie/saia da descoberta em uma conta: conversa, prévias e presença devem perder acesso.
6. No Safari físico, confira campo com teclado aberto, áreas seguras, anexo e retorno à lista.
