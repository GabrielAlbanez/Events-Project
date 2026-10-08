# Moderação, auditoria e recuperação de eventos

## Banco

A migração aditiva `20261004170000_user_suspension_audit` depende da migração de impersonação anterior. Aplicar somente após autorização para o banco configurado:

```sh
npx prisma migrate deploy
npx prisma generate
```

Ela preserva usuários e eventos. Acrescenta metadados de suspensão, uma versão de sessão, justificativa dos acessos administrativos e auditoria de suspensões.

## Suspensão

Na página Usuários, administradores podem suspender e restaurar contas comuns/promotores mediante justificativa. O prazo é opcional, limitado a 365 dias. Administradores e a própria conta são protegidos no servidor. A exclusão permanente permanece uma ação separada.

A suspensão encerra impersonações da conta e invalida suas sessões anteriores. APIs e Socket.IO revalidam o acesso no servidor; uma restauração ou expiração permite novo login, mas nunca reativa tokens antigos. A entrega do aviso depende da conexão; contas desconectadas recebem a restrição ao tentar autenticar. A revalidação periódica é uma proteção adicional à sinalização imediata.

## Auditoria

`/admin/auditoria` permite consultar acessos por conta, situação e intervalo de datas, com paginação. Somente administradores autenticados podem consultar a API. O motivo é obrigatório para novos acessos. Registros anteriores exibem indicação de justificativa legada. O IP depende do servidor HTTP utilizado e pode estar indisponível; nenhum conteúdo de conversas é registrado.

## Rascunhos

A recuperação local não publica eventos nem substitui o salvamento manual no servidor. O rascunho é associado à conta e ao evento neste navegador. Imagens precisam ser selecionadas novamente. Em dispositivos compartilhados, dados locais podem ser lidos por quem tem acesso ao perfil do navegador.

## Executar

Após aplicar a migração autorizada, execute `npm run dev:socket` e abra `http://localhost:3000`. Faça login manual. Para sessões simultâneas, utilize janela anônima ou outro perfil.

## Validar manualmente

- Suspender uma conta de teste em outro perfil; confirmar aviso, logout e bloqueio de APIs/Socket.IO.
- Restaurar: confirmar novo login e rejeição da sessão antiga.
- Testar prazo expirado, proteção de admin/self e justificativa obrigatória.
- Consultar auditoria com filtros/paginação; conta comum deve receber acesso negado.
- Digitar um evento, aguardar salvamento local, recarregar e recuperar explicitamente.
- Trocar de conta e confirmar isolamento; salvar manualmente e confirmar limpeza.
- Conferir mobile/desktop e claro/escuro, teclado e falhas de armazenamento.
