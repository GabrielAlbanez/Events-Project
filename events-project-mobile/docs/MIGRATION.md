# Migração da API mobile independente

O app Expo usa a API Node.js em `server/` na porta 4100; não chama a API do site
nem importa código Next.js/NextAuth. Aplicação web e mobile compartilham somente
o PostgreSQL. Nenhum arquivo dentro de `Events-Project` foi alterado nesta
migração.

## Cobertura implementada

- Google e credenciais, cadastro, verificação/reenvio de e-mail, recuperação,
  logout, sessão bearer e perfil.
- Listagem/detalhes e autoria de eventos, imagens próprias no banco, duplicação,
  cancelamento, recorrência e calendário ICS.
- Favoritos, lembretes, notificações, inscrição/lista de espera, check-in,
  denúncias, histórico e métricas de engajamento/promotor.
- Administração, revisão de eventos/denúncias, suspensão, exclusão e
  impersonação auditada.
- Comunidade, salas, atividade, chat de evento/privado, conexões, mídias privadas
  e Socket.IO com autenticação/autorização próprias.

## Como iniciar

1. Configure `server/.env` e aplique as tabelas auxiliares com
   `npm run api:migrate`.
2. Inicie `npm run api:dev` em um terminal.
3. Inicie `npx expo start` em outro terminal. A configuração Expo padrão usa a
   porta 4100; o emulador Android usa `10.0.2.2:4100`.

O schema de mídia é explícito e idempotente. Imagens legadas não são copiadas
automaticamente: revise o dry-run de cada importador, confirme backup e só então
use `--apply`. Nenhum importador apaga ou modifica arquivos no site.

## Limites de validação

Build e testes automatizados cobrem os contratos de domínio, HTTP, autorização,
autoria de eventos, administração, mídia e realtime usando doubles isolados.
Isso não substitui a execução da migração e testes com o PostgreSQL configurado,
Google OAuth real, serviço de e-mail, origem de imagens, dois dispositivos ou
uma build nativa de produção. `GET /health` só confirma o processo HTTP.
