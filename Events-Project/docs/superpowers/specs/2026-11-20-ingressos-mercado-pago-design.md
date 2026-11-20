# Venda de ingressos com Pix e divisão automática (Mercado Pago)

## Objetivo
O promotor vende ingressos de eventos pagos pelo EventMap. O comprador paga um Pix gerado pelo site; o Mercado Pago (MP) divide na hora: o valor vai para a conta MP do promotor e 20% (taxa da plataforma) vai para a conta MP dona do app EventMap. O ingresso é confirmado automaticamente e vira a inscrição com QR code já usada no check-in.

## Decisões
- **Provedor:** Mercado Pago, modelo marketplace. O promotor conecta a conta dele por OAuth ("Conectar Mercado Pago"); o site cria o pagamento com o token do promotor e `application_fee` = 20%. Só a chave Pix não permite divisão automática.
- **Quem paga a taxa:** sai do valor do promotor. O comprador paga o preço anunciado. Promotor recebe preço − 20% − taxa do MP sobre Pix (~0,99%).
- **Ingresso:** 1 ingresso por comprador por evento (reaproveita `EventRegistration` único por usuário/evento e o QR do check-in). Quantidade múltipla fica para depois.
- **Lotação:** campo opcional `ticketCapacity`; pedidos pendentes não expirados reservam vaga.
- **Validade do Pix:** 30 minutos. Pedido expirado libera a vaga.
- **Confirmação:** webhook do MP. O corpo do webhook nunca é confiado: o site valida a assinatura `x-signature` (HMAC com o segredo do webhook) e depois consulta o pagamento na API do MP com o token do promotor, conferindo `status = approved`, `external_reference = id do pedido` e valor. Também há verificação ao vivo na tela do comprador (consulta o pagamento quando a página pede status), para não depender só do webhook.
- **Reembolso:** nesta fase, o promotor ou admin cancela pelo painel e o site chama o estorno do MP (devolve o valor inteiro e a taxa da plataforma). Cancelar o evento com vendas exige estornar antes.
- **Valores mínimos:** preço entre R$ 5,00 e R$ 5.000,00 por ingresso.

## Dados (migração aditiva)
- `MercadoPagoAccount`: `userId` (único), `mpUserId`, `accessTokenEnc`, `refreshTokenEnc`, `expiresAt`, `connectedAt`, `updatedAt`. Tokens criptografados com AES-256-GCM (`TICKETS_ENCRYPTION_KEY`); nunca vão para o cliente nem para logs. Renovação com o refresh token antes de expirar.
- `Events`: `ticketsEnabled Boolean @default(false)`, `ticketCapacity Int?` (já existem `isFree` e `priceCents`).
- `TicketOrder`: `id`, `eventId`, `buyerId`, `sellerId`, `unitCents`, `feeCents`, `status` (`PENDING`, `PAID`, `EXPIRED`, `CANCELLED`, `REFUNDED`), `mpPaymentId` (único), `pixCopyPaste`, `pixQrBase64`, `expiresAt`, `paidAt`, `refundedAt`, `createdAt`, `updatedAt`. Índices por evento/status e comprador.

## Fluxos
1. **Conectar:** `/myEvents/pagamentos` → OAuth MP (`state` assinado e amarrado à sessão, contra CSRF) → callback troca o código por tokens no servidor → salva criptografado. Desconectar apaga os tokens.
2. **Configurar evento:** no formulário do evento pago, "Vender ingressos pelo EventMap" (só com conta conectada) + lotação opcional. Mostra "Você recebe R$ X por ingresso (20% de taxa do EventMap)".
3. **Comprar:** na página do evento, "Comprar ingresso — R$ X" (exige login e e-mail verificado) → server action cria o pedido numa transação Serializable (checa vaga, pedido aberto, evento publicado e futuro) → cria o pagamento Pix no MP com chave de idempotência = id do pedido → mostra QR e copia-e-cola com contagem regressiva → confirma sozinho.
4. **Confirmar:** webhook ou verificação ao vivo → transação: pedido `PENDING → PAID` (guardado por status) + cria/ativa `EventRegistration` + notificação "Ingresso confirmado".
5. **Painéis:** promotor vê vendas, valor bruto, taxa e líquido por evento; admin vê totais de taxa arrecadada; comprador vê "Meus ingressos" com o QR.

## Segurança
- Preço e taxa calculados no servidor; o cliente envia só `eventId`.
- Webhook: assinatura validada, consulta à API do MP, idempotente (repetições não duplicam), responde 200 rápido.
- Tokens criptografados; segredos só em variáveis da Vercel (`MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_WEBHOOK_SECRET`, `TICKETS_ENCRYPTION_KEY`).
- Limite de tentativas na criação de pedidos por usuário.
- Promotor não compra o próprio ingresso; personificação (impersonation) não compra.

## Testes
Testes offline com `fetch` do MP simulado: cálculo da taxa, criação idempotente, lotação e corrida de dois compradores na última vaga, webhook com assinatura inválida, webhook com valor divergente, pagamento repetido, expiração, estorno, OAuth com `state` inválido. Nenhuma chamada real ao MP nos testes. Teste ponta a ponta no ambiente isolado com as credenciais de teste do MP quando o usuário criar o app.

## Fora desta fase
Vários ingressos por compra, tipos de ingresso/lotes, cartão de crédito, cupons, emissão de nota fiscal.

## Pendências do usuário
1. Criar o app no painel de desenvolvedor do Mercado Pago (modo marketplace, redirect `https://events-project-lake.vercel.app/api/mercadopago/callback`) e configurar o webhook de pagamentos para `https://events-project-lake.vercel.app/api/webhooks/mercadopago`.
2. Cadastrar as 4 variáveis na Vercel (Sensitive). Eu gero a `TICKETS_ENCRYPTION_KEY` sem exibi-la, se preferir.
3. Revisar os Termos de Uso: intermediação, taxa de 20%, política de reembolso (direito de arrependimento de 7 dias em compras online, CDC art. 49).
