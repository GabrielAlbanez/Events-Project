# E-mail do EventMap

Todo e-mail transacional da aplicação web (confirmação de cadastro, aviso de conta já existente e recuperação de senha) passa por um único transporte Nodemailer em `lib/mail/transport.ts`. Os modelos HTML em pt-BR, com versão em texto puro, ficam em `lib/mail/templates.ts`.

## Escolha do transporte

| Situação | Transporte usado |
|---|---|
| `SMTP_HOST` definido | SMTP genérico com `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` e `MAIL_FROM` |
| `SMTP_HOST` vazio | Preset Gmail anterior com `EMAIL_USER` e `EMAIL_PASS` (comportamento do deploy atual, sem mudança) |
| Nenhum dos dois configurado | Cadastro, reenvio e recuperação respondem que o envio está indisponível (HTTP 503), sem carregamento infinito |

Regras do SMTP genérico:

- `SMTP_PORT` vazio usa 465 quando `SMTP_SECURE=true` e 587 nos demais casos. Porta inválida desativa o envio.
- `SMTP_SECURE` vazio liga TLS implícito apenas na porta 465. Em produção, as demais portas exigem STARTTLS (`requireTLS`), então o servidor recusa SMTP sem criptografia. Em desenvolvimento, um coletor local (Mailpit, MailHog) pode funcionar sem TLS.
- `SMTP_USER` sem `SMTP_PASS` desativa o envio. Sem usuário, a conexão é feita sem autenticação.
- `MAIL_FROM` define o remetente, por exemplo `EventMap <nao-responda@seu-dominio.com>`. Se ficar vazio, o remetente é `SMTP_USER` (ou `EMAIL_USER` no Gmail). Use um domínio com SPF, DKIM e DMARC configurados no provedor.

Os erros de SMTP nunca chegam ao navegador nem aos logs com detalhes. O usuário vê uma mensagem genérica e pode reenviar a confirmação em `/confirmar-email`.

## Configurar na Vercel

1. Em **Vercel → events-project → Environment Variables → Production**, escolha uma opção:
   - **Provedor transacional** (Resend, Amazon SES, Postmark, Mailgun, Brevo): cadastre `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` e `MAIL_FROM` com os valores do painel do provedor. Marque usuário e senha como segredos.
   - **Gmail atual**: mantenha `EMAIL_USER` e `EMAIL_PASS` (senha de app de uma conta com verificação em duas etapas) e deixe `SMTP_HOST` vazio.
2. Confira `NEXTAUTH_URL` e `NEXT_PUBLIC_BASE_URL` com a origem HTTPS do EventMap. Os links dos e-mails usam essa origem; em produção, uma origem sem HTTPS bloqueia o envio.
3. Na Vercel, defina `TRUST_PROXY_IP=true` para que os limites de tentativa usem o IP real do visitante (a Vercel sobrescreve `x-forwarded-for`). Sem isso, os limites por IP viram um balde global.
4. Republique e teste com uma caixa de teste sua: cadastro novo, cadastro repetido com o mesmo e-mail (deve chegar o aviso "Você já tem uma conta"), reenvio de confirmação e recuperação. Confira se os links abrem o domínio de produção, se expiram e se a segunda utilização é recusada.

A API mobile (`../events-project-mobile`) tem envio próprio e não lê estas variáveis.

## Limites de tentativa e respostas uniformes

- Login com senha: até 10 falhas por e-mail a cada 15 minutos e 50 por IP (com `TRUST_PROXY_IP=true`). Um login correto limpa as falhas do e-mail.
- Cadastro: até 3 tentativas por e-mail por hora, 10 por IP, ou 200 no total por hora quando o IP não é confiável.
- Recuperação e reenvio de confirmação: 3 por e-mail por hora e 20 por IP (100 no balde global).
- Os contadores ficam na tabela `VerificationToken` (identificadores `auth-rate:` e `account-rate:`, só com hashes), compartilhados por todas as instâncias e limpos ao expirar. Não há migração nova.
- Cadastro, recuperação e login respondem da mesma forma quando o e-mail existe ou não. Quem tenta cadastrar um e-mail já usado recebe a mesma mensagem de sucesso, e o dono da conta recebe o aviso por e-mail.
- Limitação conhecida: o limite por e-mail no login permite que alguém bloqueie temporariamente (15 minutos) o login com senha de uma conta específica. O login com Google e a recuperação de senha continuam disponíveis.

## Monitoramento

`GET /api/health` responde `{ status, db, time }` sem cache e sem detalhes internos: HTTP 200 com `db: "ok"` ou HTTP 503 com `db: "error"`. Ele não testa o SMTP; para isso, use o teste manual do passo 4.
