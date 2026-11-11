# Controles da descoberta e localização — 10/11/2026

## Alterações
- Filtros Quando/Categoria usam a primitiva Radix Select existente, com labels, foco, menus nos temas claro/escuro e áreas de toque de 44px. Valores da busca e contratos mantidos.
- A explicação de uso de localização é lembrada na sessão da aba após a aceitação. Somente o indicador `eventmap:location-notice-accepted=1` é persistido; coordenadas não são salvas nessa preferência.
- Nenhuma posição é solicitada automaticamente. Crosshair e origem da rota usam o mesmo fluxo; duploclique não duplica uma solicitação em andamento. Permissão e eventual confirmação nativa continuam sob controle do navegador.
- Mensagens específicas para bloqueio e timeout; recusar a explicação não registra aceitação.

## Verificações
- TypeScript e lint aprovados.
- Regressão `node scripts/verify-privacy.cjs` aprovada.
- Harness do componente real, com geolocalização simulada: sem solicitação automática, recusa, primeira aceitação, segunda ação, duploclique, remontagem na mesma sessão, armazenamento bloqueado e permissão negada.
- Browser local: temas claro/escuro; larguras 390, 724 e 1280px; seleção Categoria por teclado; menu integrado; mapa com eventos reais e explicação inicial cancelada sem conceder localização real.
- Build final isolado aprovado, incluindo lint e verificação de tipos.

A conexão Socket.IO local usa servidor externo não disponível nesse contexto; o aviso de reconexão local não foi tratado como falha desta correção. Não houve alteração de servidor, banco, autenticação ou permissões nativas.
