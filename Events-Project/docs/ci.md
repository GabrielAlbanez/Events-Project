# Verificação automática do site

O workflow [Web CI](../../.github/workflows/web-ci.yml) valida pull requests destinados à `main`, pushes na `main` e a branch de implementação `codex/web-ci`. Também oferece execução manual. O check tem nome `Web quality`.

## O que executa

1. Node.js 24 e instalação pelo package-lock com `npm ci --legacy-peer-deps`.
2. Geração do Prisma e aplicação das migrações em PostgreSQL 16 descartável.
3. TypeScript da aplicação e do servidor Socket.IO, sem emitir arquivos.
4. Lint, oito suítes de regressão existentes e verificação da demonstração de portfólio.
5. Build de produção do Next.js.

O serviço PostgreSQL existe apenas durante o job; a autenticação `trust` é exclusiva desse ambiente temporário e não é uma configuração recomendada para servidores publicados. O job não recebe segredos de produção, não faz deploy e não cria contas no Neon. O checkout tem acesso de leitura e não persiste credenciais. As actions estão fixadas por SHA; revise atualizações desses hashes periodicamente.

Não são executados scripts `:db`, `:http` ou E2E de produção. As migrações são verificadas contra um banco vazio; isso não comprova migração de dados legados. Os testes de Socket.IO usam os cenários isolados existentes: não substituem validação de duas sessões autenticadas na produção. Google OAuth, Maps, SMTP, Blob e Web Push reais ficam fora deste job.

## Uso

Abra a aba **Actions → Web CI** no GitHub para consultar etapas e logs. Em um PR, veja **Checks → Web quality**. O job é interrompido na primeira falha, tem limite de 20 minutos e execuções antigas da mesma branch/PR são canceladas.

O workflow só vira uma barreira obrigatória de merge se a proteção da `main` exigir o check `Web quality`. Essa configuração de proteção não é alterada por este arquivo. Não confunda um workflow disponível com proteção obrigatória já ativada.

A execução automática consome a franquia de GitHub Actions aplicável à conta/repositório. Nenhum plano pago foi contratado. O cache guarda o cache do npm, não `.env`, banco, uploads ou `node_modules`.

## Reproduzir localmente

Na pasta `Events-Project`, use os mesmos comandos listados no YAML. Antes de `prisma migrate deploy`, confirme que `DATABASE_URL` aponta para um banco de desenvolvimento. O job hospedado cria o banco temporário automaticamente; esses comandos no seu terminal usam a configuração local.

Referências: [build e testes Node.js no GitHub Actions](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs), [setup-node](https://github.com/actions/setup-node), [checkout](https://github.com/actions/checkout).
