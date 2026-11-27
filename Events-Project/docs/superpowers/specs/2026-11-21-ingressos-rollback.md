# Ingressos (Pix / Mercado Pago): rollback

## Como reverter o código

- Faça redeploy do commit anterior na Vercel (Deployments → deploy anterior → "Promote to Production"). Não é preciso mexer no banco.
- Para só pausar as vendas sem redeploy: remova `MP_CLIENT_ID` (ou outra variável de pagamento) na Vercel e faça redeploy. O site passa a mostrar "As vendas deste evento estão pausadas no momento.", não abre inscrição gratuita em eventos pagos e o webhook responde 503, então o Mercado Pago reenvia as notificações quando as variáveis voltarem.

## Migrações

- `20261121120000_ticket_sales`: só adiciona (enum, duas tabelas, duas colunas em `events` com padrão seguro). O código anterior ignora essas estruturas; não precisa reverter.
- `20261121130000_ticket_orders_restrict`: só troca as três chaves estrangeiras de `ticket_orders` de `ON DELETE CASCADE` para `ON DELETE RESTRICT`. Nenhum dado muda. O código anterior funciona com ela; a única diferença é que excluir um evento ou usuário com pedidos de ingresso falha no banco (que é o objetivo: são registros financeiros).

### Reverter a RESTRICT manualmente (só se for realmente necessário)

Execute numa transação, com backup recente, e registre o motivo:

```sql
BEGIN;
ALTER TABLE "ticket_orders" DROP CONSTRAINT "ticket_orders_eventId_fkey";
ALTER TABLE "ticket_orders" DROP CONSTRAINT "ticket_orders_buyerId_fkey";
ALTER TABLE "ticket_orders" DROP CONSTRAINT "ticket_orders_sellerId_fkey";
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;
```

Depois disso o `schema.prisma` volta a divergir do banco: altere as três relações de `TicketOrder` para `onDelete: Cascade` e crie uma migração nova com esse mesmo SQL. Não edite nem apague a migração já aplicada.

## O que não fazer

- Não apague linhas de `ticket_orders` nem `mercado_pago_accounts` para "limpar": são registros financeiros e os tokens são necessários para estornos.
- Não troque `TICKETS_ENCRYPTION_KEY`: os tokens guardados deixam de abrir e todos os organizadores precisam reconectar.
- Não rode `prisma migrate reset`, `db push --accept-data-loss` nem `migrate dev` contra produção.
- Não reverta a RESTRICT só para conseguir excluir um evento ou usuário: cancele o evento e estorne os ingressos, ou suspenda a conta.
