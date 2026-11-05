# E-mail do EventMap na Vercel

O transporte atual usa Gmail via Nodemailer. Use uma conta com verificação em duas etapas e uma senha de app. A conta precisa permitir senhas de app.

1. Em **Vercel → events-project → Environment Variables → Production**, adicione `EMAIL_USER` e `EMAIL_PASS` como segredos. Use o endereço da caixa de envio e a senha de app.
2. Confira `NEXTAUTH_URL` e `NEXT_PUBLIC_BASE_URL` com a origem HTTPS do EventMap. A aplicação prioriza `NEXTAUTH_URL` para gerar os links, com `NEXT_PUBLIC_BASE_URL` como fallback.
3. Republice e teste cadastro, reenvio e recuperação com uma caixa de teste sua. Confira se os links abrem o domínio de produção, se os tokens expiram e se a segunda utilização é recusada.

O código usa o preset Gmail. Para outro provedor, a configuração do transporte SMTP precisa ser adaptada ao host e à porta desse provedor.
