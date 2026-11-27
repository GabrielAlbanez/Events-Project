# 07 — QA, Segurança e Testes

Branch auditada: `codex/produto-comercial-20261118` (HEAD `1f536cd`). Esta auditoria foi **somente leitura**. Nenhum arquivo além deste relatório foi alterado e nenhuma escrita foi feita no banco. Os testes manuais usaram apenas requisições GET não autenticadas contra `http://localhost:3000`.

## 1. Resumo executivo

A base de segurança do EventMap está acima da média de um projeto desse porte. O middleware protege todas as rotas privadas e administrativas, o `callbackUrl` não abre redirecionamento externo, os uploads conferem os bytes iniciais do arquivo (magic bytes), têm cota e limite de tamanho, os handlers de API checam a origem (`Origin`) e a sessão é revalidada no banco a cada leitura (suspensão, `sessionVersion`, troca de senha e impersonação). A recuperação de senha já tem rate limit persistente e resposta que não revela se a conta existe.

As lacunas que impedem vender o produto com segurança estão concentradas em cinco pontos:
1. **Autenticação sem proteção contra força bruta:** o login e o cadastro não têm rate limit e permitem descobrir quais e-mails têm conta.
2. **Cabeçalhos de segurança:** a CSP só existe em modo *Report-Only* e não há HSTS.
3. **Dependências:** 15 vulnerabilidades em pacotes de produção, sendo 2 críticas.
4. **Testes sem execução unificada:** não há comando de teste único nem CI. Cerca de 41 dos 88 scripts `verify-*` não são chamados por nenhum script do `package.json`.
5. **Tratamento de erros:** faltam páginas globais de erro e 404, e também faltam monitoramento e health check confiáveis.

Todos esses itens podem ser corrigidos **sem mudar o schema Prisma**.

## 2. Mapa de testes automatizados existentes

| Item | Situação | Evidência |
|---|---|---|
| Scripts `verify-*.cjs` | 88 arquivos em `scripts/` (108 scripts no total) | `ls scripts` |
| Suítes `test:*` no `package.json` | 16 suítes: ai-events, features, realtime, community, activity, event-chat, party-connections, account-removal, security, site-improvements, notifications, entre outras | `package.json:21-46` |
| Script `test` agregado | **Não existe.** `npm test` falha | `package.json:7-46` |
| Scripts verify sem nenhuma referência no package.json | **41**, entre eles alguns de segurança: `verify-auth-return`, `verify-admin-origin`, `verify-privacy`, `verify-impersonation*`, `verify-user-suspension`, `verify-suspension-sessions`, `verify-site-routes`, `verify-public-url`, `verify-profile-upload-quota`, `verify-checkin-signatures`, `verify-community-origin`, `verify-attendance-origin` | `comm` entre a lista de arquivos e as referências no `package.json` |
| CI | Só existe `../.github/workflows/keepalive.yml`, que faz ping no Render. Não há lint, tsc ou testes em CI | `.github/workflows/keepalive.yml:22-30` |
| Ferramentas de teste | Não há Jest, Vitest, Playwright nem Testing Library nas dependências. Os testes usam `node:assert` e transpilam TS com `typescript` | `scripts/verify-registration-security.cjs:1-40` |
| E2E | `scripts/e2e-producao.mjs` importa `playwright`, que **não está instalado**, aponta para **produção** (`events-project-lake.vercel.app`) e grava dados | `scripts/e2e-producao.mjs:16-19` |

**Scripts executados nesta auditoria** (todos offline, sem banco nem HTTP):
- `node scripts/verify-auth-return.cjs`: PASS
- `node scripts/verify-admin-origin.cjs`: PASS
- `node scripts/verify-registration-security.cjs`: PASS

Observação: `verify-auth-page-access.cjs` cria um `PrismaClient` e grava dados (linhas 49-56), por isso **não foi executado**.

## 3. Smoke test das páginas (GET sem autenticação)

| Rota | Status | Observação |
|---|---|---|
| `/`, `/login`, `/register`, `/recuperar-senha`, `/redefinir-senha`, `/confirmar-email`, `/verifyEmail`, `/demonstracao`, `/privacidade`, `/privacidade/solicitacoes`, `/EventsCreated` | 200 | Públicas, como esperado |
| `/admin`, `/admin/auditoria`, `/admin/reports`, `/admin/eventos-ia`, `/admin/conexoes-denuncias` | 307 para `/login?callbackUrl=...` | Protegidas |
| `/CriarEvento`, `/Profile`, `/atividade`, `/myEvents`, `/myEvents/x/checkin`, `/notificacoes`, `/perfil-conexoes`, `/resultados`, `/salas`, `/salas/x`, `/salvos` | 307 para o login | Protegidas |
| `/eventos/x/editar`, `/eventos/x/chat`, `/eventos/x/conexoes`, `/eventos/x/conexoes/y` | 307 para o login | Protegidas |
| `/eventos/<id real>`, `/promotores/<id real>`, `/eventos/<id real>/comunidade` | 200 | Públicas |
| `/eventos/x`, `/promotores/x` | 404 | Correto |
| `/eventos/x/comunidade` | **200** | Devolve a casca da página para um evento inexistente, com título genérico (`app/eventos/[id]/comunidade/page.tsx:3-5`) |
| `/login?callbackUrl=https://evil.com` | 200 | `safeReturnPath` descarta o destino externo (`lib/authReturn.ts:2-14`) |
| `/admin` com cabeçalho `x-middleware-subrequest` (CVE-2025-29927) | 307 | Next 14.2.35 instalado, já corrigido |
| `/robots.txt`, `/sitemap.xml` | 200 | Existem (`app/robots.ts`, `app/sitemap.ts`) |
| `/termos`, `/api/health` | 404 | Não há termos de uso nem health check |

## 4. Smoke test das APIs GET (sem autenticação)

| Rota | Status | Expõe dado privado? |
|---|---|---|
| `/api/AllEvents` | 200 | Não expõe e-mail. Expõe `user.image` com **IP de rede local** (`http://192.168.15.75:4100/v1/media/...`). A lista não tem limite e inclui eventos passados (`app/(actions)/getAlllEvents/action.ts:5-8`) |
| `/api/dataAllUser`, `/api/admin/*` | 401/403 | Não |
| `/api/admin/users/<uuid>/events` | 403 (400 quando o id é inválido) | Não |
| `/api/admin/impersonation/status` | 200 `{blocked:false,impersonation:null}` | Não |
| `/api/community/activity`, `/rooms`, `/event-chat`, `/party-*`, `/my-calendar`, `/events/x/check-in-token` | 401 | Não |
| `/api/community/events/<id>` | 200 | Só conteúdo público e `permissions.authenticated=false` |
| `/api/events/<id>/registration` | 200 | Só contagens agregadas |
| `/api/event-calendar/<id>` | 200 | Arquivo ICS público. O horário em UTC está correto |
| `/api/socket` | 200 `{"status":"available"}` | Resposta **fixa no código** (ver seção "Não conectado") |
| `/api/auth/session` | 200 `{}` | Não |

Conclusão: **nenhuma API GET entregou dados privados sem autenticação.**

## 5. Revisão de segurança

### 5.1 Pontos fortes (confirmados no código)
- **Middleware:** o `matcher` cobre todas as rotas privadas e administrativas (`middleware.ts:24-26`). A política por papel está em `lib/authPolicy.ts:23-42`, e o redirecionamento usa `safeReturnPath` (`lib/authReturn.ts:2-19`).
- **Revalidação da sessão:** o callback `jwt` relê o usuário no banco a cada leitura de sessão, nega acesso em caso de falha e cobre suspensão, `sessionVersion`, troca de senha e conta removida (`lib/auth/options.ts:154-186`). `getAuthenticatedUser` refaz as mesmas checagens no servidor (`lib/adminAuth.ts:10-27`).
- **Server actions administrativas:** `deleteEvents`, `validateEvents`, `alterRoleUser` e `deleteUser` checam `getAuthenticatedAdminId` (`app/(actions)/deleteEvents/action.ts:14-20`, `validateEvents/action.ts:10-16`). As actions de evento exigem papel PROMOTER ou ADMIN e ser dono do evento (`lib/services/events.ts:11-16, 30-37`).
- **Upload:** checagem de `Origin`, autenticação, multipart limitado, magic bytes PNG/JPEG/WEBP/AVIF, cota por usuário e rollback em caso de erro (`app/api/upload/route.ts:16-38`, `lib/storage/profileImages.ts:8-43`).
- **CSRF:** handlers que alteram dados usam `checkOrigin`/`isAllowedRequestOrigin` (`lib/community/http.ts:6-9`, `lib/publicUrl.ts:20-24`). As server actions contam com a checagem de Origin e Host do próprio Next 14. Cookies `sameSite: "lax"`.
- **XSS:** existe um único `dangerouslySetInnerHTML`, no JSON-LD da página de evento, e ele escapa `<` (`app/eventos/[id]/page.tsx:40`). Os links de ingresso só aceitam `http`/`https` (`schemas/eventInput.ts:3-5`).
- **Recuperação de senha:** rate limit persistente por e-mail e por cliente, token aleatório guardado como hash, resposta genérica e invalidação de sessões ao redefinir (`lib/services/passwordRecovery.ts:22-80`).
- **Socket.IO:** CORS com lista de origens permitidas e ticket assinado com expiração (`server.mts:46-70, 111-157`).
- **Variáveis `NEXT_PUBLIC_*`:** só `BASE_URL`, `GOOGLE_MAPS_API_KEY` e `SOCKET_URL`, todas destinadas ao cliente. A chave do Maps precisa de restrição por referrer no Google Cloud, o que não dá para verificar pelo código.

### 5.2 Achados

**A1 (P0): login e cadastro sem rate limit, com enumeração de contas**
- `validateUser` é uma server action pública que funciona como oráculo de senha. Ela responde mensagens diferentes conforme o caso: e-mail ligado ao Google ("vinculado a outro provedor"), conta inexistente ou não verificada ("verifique seu e-mail") e senha errada ("Email ou senha incorretos") (`lib/services/credentials.ts:15-58`, `app/(actions)/Login/action.ts:5-7`).
- O `authorize` do NextAuth também não tem limite. Ele só roda o bcrypt quando o usuário existe, o que permite descobrir contas pelo tempo de resposta (`lib/auth/options.ts:52-63`).
- `/api/register` informa "O email já está registrado" (`lib/services/registration.ts:26-28`) e não tem limite de chamadas.
- Senha mínima de 6 caracteres (`schemas/accountInput.ts:6`, `schemas/passwordRecovery.ts:5`).
- O fluxo de login roda o bcrypt duas vezes por tentativa e ainda espera 1 s fixo (`components/login-form.tsx:55-83`).

**A2 (P0): `/api/register` frágil**
- Não checa `Origin`.
- `req.json()` está fora de `try/catch`, então um JSON malformado gera erro 500.
- Retorna HTTP 200 mesmo em caso de erro (`app/api/register/route.ts:10-19`).
- O e-mail não é normalizado (`schemas/accountInput.ts:5` só faz `trim`). Tanto o cadastro quanto o login usam `findUnique` com comparação exata (`lib/services/registration.ts:22`, `lib/auth/options.ts:52-54`), enquanto a recuperação compara sem diferenciar maiúsculas (`lib/services/passwordRecovery.ts:42`). Resultado: `Ana@x.com` e `ana@x.com` podem virar duas contas, e o usuário que digita o e-mail com maiúsculas diferentes não consegue entrar.

**A3 (P0): cabeçalhos de segurança incompletos**
- A CSP só é enviada como `Content-Security-Policy-Report-Only`, só em produção e sem `report-uri`. Por isso não bloqueia nada e não envia relatórios para lugar nenhum (`next.config.mjs:55-57`). Ela ainda contém `script-src 'unsafe-inline'` (`next.config.mjs:20`).
- Não há `Strict-Transport-Security`, e `X-Powered-By: Next.js` aparece nas respostas (confirmado com `curl -I`). Falta `poweredByHeader: false`.

**A4 (P0): dependências vulneráveis (`npm audit --omit=dev`)**
- 15 vulnerabilidades: 13 altas e 2 críticas.
  - `next` (DoS no Image Optimizer, ligado a `remotePatterns`; a correção completa só existe no 16.x).
  - `tar` (path traversal).
  - `nodemailer` (injeção de comando SMTP e envio para domínio não intencional).
  - `follow-redirects`, `zod`, `postcss`, `@vercel/blob` (via `oidc`) e `next-cloudinary`.
- `next-cloudinary` **não é importado em nenhum lugar** de `app/`, `components/` ou `lib/`: é uma dependência morta que só aumenta a superfície de ataque.
- O `package.json` declara `"next": "^14.2.23"` (linha 81), mas o pacote instalado é o 14.2.35. Vale subir o mínimo declarado para 14.2.35.

**A5 (P1): mensagem de erro da URL exibida sem filtro**
- `toast.error(decodeURIComponent(error))` mostra qualquer texto passado em `?error=` (`components/login-form.tsx:45-48`). Não é XSS, porque o toast renderiza texto puro, mas permite falsificar avisos para phishing, como `/login?error=Conta bloqueada, ligue 0800...`.
- O `signIn` lança a mensagem já codificada para URL (`lib/auth/options.ts:101-105`).

**A6 (P1): logs com erro bruto**
- `console.error("Erro na rota:", error)` registra o objeto de erro completo, que pode incluir detalhes internos do Prisma (`app/api/EventsUser/route.ts:25`).
- Não há monitoramento de erros (Sentry ou equivalente).

**A7 (P2): configuração de sessão confusa**
- `jwt.maxAge` vale 180 s (`lib/auth/options.ts:244-248`), mas o NextAuth recodifica o token com `session.maxAge`, que é 30 dias por padrão, a cada leitura de `/api/auth/session` (`node_modules/next-auth/core/routes/session.js:72-76`).
- Na prática a sessão é deslizante e dura 30 dias. O valor de 180 s não tem efeito real e dá uma falsa impressão de que as sessões expiram rápido.

**A8 (P2): verificação de e-mail por GET e token guardado em texto puro**
- `GET /api/verifyEmail` consome o token (`app/api/verifyEmail/route.ts:4-9`). Scanners de link que executam JavaScript podem confirmar a conta no lugar do usuário.
- `VerificationTokenEmail` guarda o token sem hash e uma cópia do hash da senha (`lib/services/registration.ts:37-39`, `lib/services/passwordRecovery.ts:51`).

## 6. Bugs e fluxos quebrados ou enganosos
1. `/eventos/<inexistente>/comunidade` retorna 200 com a casca da página, sem 404 e sem `metadata` própria (`app/eventos/[id]/comunidade/page.tsx:3-5`).
2. Não existem `app/not-found.tsx`, `app/error.tsx` nem `app/global-error.tsx`. Só há `error.tsx` em `resultados`, `eventos` e `promotores`.
3. `/api/AllEvents` não tem paginação, inclui eventos já encerrados e expõe URLs de imagem com IP de rede local, porque o banco ainda guarda URLs legadas da API mobile. A normalização só acontece no cliente (`lib/profileMediaUrl.ts:16-18`).
4. O `e2e-producao.mjs` não roda: depende de `playwright`, que não está instalado, e grava no ambiente de produção.
5. Não existe página de Termos de Uso (`/termos` responde 404). Isso é exigido para vender o produto, junto com a política de privacidade que já existe.

## 7. Funcionalidades que parecem funcionar mas não estão conectadas
- `app/api/socket/route.ts:7-12`: sempre responde `status: "available"`, mesmo quando o servidor Socket.IO não está rodando (por exemplo, num deploy na Vercel). O cliente não usa essa rota. Ela engana quem a usar como health check.
- `scripts/e2e-producao.mjs:16`: E2E com `import("playwright")`, mas o pacote não está nas dependências.
- 41 scripts `verify-*` não são chamados por nenhum script do `package.json` nem por CI, então ninguém os executa.

## 8. Oportunidades priorizadas

| # | Prioridade | Título | Muda o schema? | Precisa de credenciais externas? |
|---|---|---|---|---|
| 1 | P0 | Rate limit e respostas uniformes no login e no cadastro | Não (reusa `VerificationToken` como contador) | Não |
| 2 | P0 | Corrigir `/api/register` e normalizar o e-mail | Não | Não |
| 3 | P0 | Ativar CSP em modo bloqueante, HSTS e `poweredByHeader: false` | Não | Não |
| 4 | P0 | Corrigir dependências vulneráveis e remover `next-cloudinary` | Não | Não |
| 5 | P0 | Comando `test:offline` agregado e CI no GitHub Actions | Não | Não |
| 6 | P1 | Páginas globais de erro e 404, 404 real na comunidade e `/api/health` real | Não | Não |
| 7 | P1 | Mostrar só mensagens de erro de login conhecidas | Não | Não |
| 8 | P1 | Logs estruturados sem dados sensíveis e monitoramento de erros | Não | Sentry é opcional |
| 9 | P1 | `/api/AllEvents` paginado, sem eventos passados e com imagens normalizadas | Não | Não |
| 10 | P1 | E2E seguro com Playwright em ambiente local ou de preview | Não | Não |
| 11 | P2 | Deixar a configuração de sessão explícita | Não | Não |
| 12 | P2 | Confirmação de e-mail por POST e token guardado como hash | Não | Não |

Os detalhes, as evidências e os arquivos de cada item estão no retorno estruturado da auditoria.
