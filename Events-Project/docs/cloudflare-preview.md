# Acesso pelo celular com Cloudflare

As chamadas do navegador usam caminhos relativos e o Socket.IO usa a mesma origem da página. `NEXTAUTH_URL` define a origem pública no servidor para autenticação, e-mails, calendário, metadados e validação de requisições. O endereço não é inferido de cabeçalhos enviados pelo cliente.

## Iniciar com o link atual

1. Abra o túnel para a porta que vai utilizar, por exemplo `cloudflared tunnel --url http://localhost:3000 --no-autoupdate`.
2. Copie a URL HTTPS exibida e execute:

```sh
npm run dev:socket:public -- --url https://seu-link.trycloudflare.com
```

Para apontar o túnel para a porta 3001, inclua `--port 3001` no comando. Pare primeiro qualquer servidor que já esteja usando essa porta. O comando compila e inicia o servidor HTTP e Socket.IO juntos e configura as URLs apenas nessa execução; não grava segredos ou um domínio temporário no repositório.

3. No celular, abra a URL HTTPS. Faça login pelo próprio link público para que cookies e callbacks permaneçam nesse domínio. Use janela anônima ou outro perfil para testar duas contas.
4. Quando o túnel gerar outra URL, reinicie o servidor com o novo `--url`. Links enviados anteriormente continuam ligados ao domínio antigo e podem deixar de funcionar.

Para voltar ao desenvolvimento local, encerre o servidor público e use `npm run dev:socket`.

## Configurações externas

- Login Google exige cadastrar a URL exata `https://seu-link.trycloudflare.com/api/auth/callback/google` entre os redirects autorizados do cliente OAuth. URLs temporárias novas exigem atualizar essa configuração; o código não pode modificar o console Google automaticamente. Um domínio estável evita essa repetição.
- A chave do Maps precisa autorizar o domínio utilizado e as APIs necessárias. O endereço do site não substitui configuração de cobrança, cotas ou permissões do Google.
- E-mails precisam de SMTP configurado; push depende de chaves VAPID e do suporte do navegador. Essas integrações não são habilitadas só pela troca de URL.
- Somente a origem local e a origem pública explicitamente configurada são aceitas. Não libere `*.trycloudflare.com` para requisições ou WebSocket.

## Conferência

Teste login/logout, upload da foto, confirmação de presença, comunidade/chat, check-in autorizado, denúncias e notificações. No calendário exportado e nos links de e-mail, confirme o domínio público. Requisições de outra origem devem ser recusadas.

## Presença entre localhost e o túnel

O servidor compartilha apenas os IDs das conexões autenticadas entre processos do mesmo computador, checkout e banco. Assim, o painel admin em `localhost:3000` acompanha usuários conectados pelo túnel para outro servidor local. As sessões e os cookies continuam separados por domínio.

A presença é sincronizada em até aproximadamente 2 segundos. Ao parar um processo abruptamente, seu último status expira em aproximadamente 10 segundos. Múltiplas abas mantêm a conta online enquanto existir outra conexão ativa. Somente administradores autorizados recebem a lista.

Essa comunicação local não conecta chats nem sincroniza servidores em computadores diferentes. Para hospedagem distribuída seria necessário um serviço compartilhado de presença e um adapter Socket.IO apropriado.
