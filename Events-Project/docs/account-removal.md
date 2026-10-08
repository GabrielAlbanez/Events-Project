# Exclusão de conta e logout em tempo real

A exclusão administrativa e o sinal pessoal de revogação são gravados na mesma transação. O servidor Socket.IO verifica a ausência da conta antes de emitir `account-removed` e desconectar todas as suas conexões. Nenhum cliente pode escolher a identidade a ser desconectada.

O sinal é processado pelo worker existente, normalmente em até dois segundos. Uma revalidação em lote a cada cinco segundos cobre sinais perdidos. Sem conexão de rede, o navegador recebe a revogação quando reconectar ou consultar a sessão; não é possível entregar um aviso instantâneo a um dispositivo offline.

O cliente encerra a conexão, executa o logout do NextAuth e abre `/login?notice=account-removed`, com um aviso acessível. A sessão e as ações protegidas verificam a existência atual da conta. Falhas de banco não são apresentadas como banimento. A exclusão mantém suas regras atuais: o administrador não pode excluir a própria conta nem outra conta administradora.

Não foi criada uma lista permanente de e-mails banidos: esta alteração revoga a conta excluída e suas sessões. Nenhuma migração nova é necessária.

## Validação

Execute `npm run test:account-removal` para testes isolados de exclusão transacional, revogação Socket.IO e cliente, sem apagar contas reais.

Para conferir manualmente em um banco de teste:

1. Inicie com `npm run dev:socket`.
2. Entre como administrador numa janela normal e como uma conta descartável numa janela anônima. Mantenha a segunda janela aberta.
3. Exclua a conta descartável pela tela Usuários. Confira o aviso, o logout e o redirecionamento em todas as janelas dessa conta.
4. Tente reutilizar sua sessão antiga e reconectar: consultas protegidas devem ser recusadas.
5. Entre com outra conta e confira que ela permanece conectada.
6. Repita com a conta descartável offline; a revogação deve ocorrer ao voltar à rede.

O fluxo destrutivo não foi executado no banco compartilhado e a inspeção entre navegadores não foi realizada. O servidor permanece parado ao concluir a implementação.
