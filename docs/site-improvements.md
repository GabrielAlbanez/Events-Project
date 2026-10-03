# Melhorias de usabilidade e segurança

## Configuração

Não há nova migração de banco nesta etapa. Recuperação e limites de envio usam a tabela existente de tokens de verificação. Configure `EMAIL_USER` e `EMAIL_PASS` no ambiente privado para enviar mensagens; `NEXTAUTH_URL` define a origem dos links. Em produção, use HTTPS. `TRUST_PROXY_IP` permanece desativado e só deve ser ativado atrás de proxy confiável que sobrescreva cabeçalhos de IP.

As páginas `/recuperar-senha`, `/redefinir-senha` e `/confirmar-email` oferecem recuperação e reenvio. Tokens de recuperação são armazenados como hash, expiram em 30 minutos e têm uso único. Pedidos possuem limites persistentes e respostas genéricas. A redefinição revoga sessões de senha anteriores: JWT e APIs comparam uma assinatura interna da credencial com o banco; o WebSocket revalida operações e desconecta também pela verificação periódica de cinco segundos. A assinatura não aparece na sessão pública. Sessões de senha antigas, emitidas antes desta proteção, exigem novo login. Sessões OAuth não são alteradas.

## Interface e consultas

- Administração: busca e permissões no servidor, 25 usuários por página, contagens separadas e eventos carregados somente ao abrir o modal (10 por página).
- Notificações: páginas de 50 itens por cursor, filtro de não lidas, retry e isolamento de respostas após troca de conta.
- Descoberta: busca, período, categoria, gratuidade e preço na URL; localização exata não é persistida. Retry preserva resultados existentes. Domingo e eventos de vários dias são considerados nos períodos.
- Filtros: respostas antigas de geolocalização e cálculo de percurso são ignoradas depois de limpar ou mudar filtros.
- Google Maps: SDK carregado apenas nas rotas de mapa, criação e edição. A interface continua disponível durante carregamento e falha.
- Ações destrutivas: diálogos acessíveis com proteção contra envios duplicados; confirmação para exclusão em massa.
- Formulário de evento: aviso de alterações não salvas ao navegar por links, atualizar ou fechar. O botão Voltar em navegação SPA não possui bloqueio universal neste fluxo.
- Navegação agrupada por descoberta, participação, organização e administração.

## Uploads

Uploads exigem conta existente, mesma origem, tamanho limitado e assinatura compatível com JPEG, PNG, WebP ou AVIF. Escrita assíncrona com nome aleatório e limpeza em falha de persistência substituem a varredura global por upload.

`npm run uploads:cleanup` apenas lista candidatos sem excluir. Depois de revisar, `npm run uploads:cleanup -- --apply` remove arquivos antigos sem referências, com revalidação por arquivo. A rotina não foi executada durante a implementação. Deploys precisam de armazenamento persistente para `public/uploads`.

## Verificação

Execute `npm run test:site-improvements`, `npm run test:account-removal`, `npm run test:features`, `npm run lint`, `npx tsc --noEmit --incremental false`, `npx tsc --project tsconfig.server.json` e `npm run build`.

Os testes isolados exercitam serviços e componentes reais com persistência, rede e navegador simulados. Não substituem teste manual de entrega SMTP, integração com o banco, Google Maps ou aparência desktop/mobile.

Para testar manualmente, execute `npm run dev:socket` e abra `http://localhost:3000`. Confira recuperação/reenvio com SMTP, páginas de usuários/notificações, filtros, confirmações, saída do formulário e mudanças de conta em janela normal e anônima. O servidor foi mantido parado ao concluir.
