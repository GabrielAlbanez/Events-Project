# EventMap: progresso da sprint

Worktree: `eventmap-main-20261118/Events-Project`, branch `codex/animacoes-20261119`. Base: `ddc4e3e`.
Deploy só com OK explícito do dono. O `.env` local aponta para o banco de produção: nunca rodar fluxos de escrita nem carga contra ele.

## Concluído (validado offline, na branch, ainda não publicado)

- Comissão de 10% no Back-end (`lib/tickets.ts`), Termos e página de organizadores. Pedidos antigos mantêm a taxa gravada.
- Vários ingressos por Pix (até 6): `TicketOrder.quantity`, `TicketPass` (ingressos 2..N com QR próprio), lotação por ingresso, taxa sobre o total, estorno cancela os não usados.
- Migração aditiva `20261123120000_ticket_quantity_passes`.
- Painel financeiro (dados): totais de vendidos, bruto, comissão, líquido e reembolsos.
- Notificações idempotentes (`createNotificationOnce`) em pagamento, estorno e pedidos de participação.
- Lembretes de eventos salvos: nada processava esses pedidos. Agora há `lib/services/eventReminders.ts`, cron diário e execução oportunista.

- Concorrência: inscrição, compra e confirmação entram em fila por evento (`lib/eventLock.ts`). Antes, com 100 inscrições simultâneas, 88 falhavam.
- Carga medida em PostgreSQL local descartável, pool de 20 conexões, Mercado Pago simulado (`scripts/load-test-isolated.cjs`). Mede os serviços, não a rede nem a Vercel:

| Simultâneos | Inscrição p95 | Compra p95 | Webhook p95 | Erros | Acima da lotação | Notificações duplicadas |
|---|---|---|---|---|---|---|
| 100 | 978 ms | 1.263 ms | 688 ms | 0 | 0 | 0 |
| 500 | 2.701 ms | 4.668 ms | 2.055 ms | 0 | 0 | 0 |
| 1.000 | 5.607 ms | 9.632 ms | 3.944 ms | 0 | 0 | 0 |

- Front-end: horários no mobile, autocomplete do Google e visão do organizador.
- Telas de múltiplos ingressos: seletor de quantidade, QR por ingresso com estado (válido, utilizado, cancelado), portaria com contador de extras, painéis do organizador e do admin com vendidos, bruto, comissão, líquido e estornos. Renderizadas com dados simulados em 390×844 e 1440×900, claro e escuro.

## Pendente

1. Publicado em produção no commit `2be4c88` (23/11/2026), com a migração aplicada. Aprovação de inscrições validada antes do deploy: 52/52 checagens com servidor e navegador reais em banco descartável. Não foi testada com contas reais em produção.
   Conexão do Mercado Pago dentro do formulário (nova aba, sem perder dados) e dashboard do promotor publicados no commit `5e0b27c`. OAuth real ainda não testado.
2. Compra real de R$ 5 (preço mínimo) para confirmar Pix, webhook, split, QR e estorno.
3. Teste em iPhone e Android reais, incluindo Google Places e leitura do QR pela câmera.
4. Auditoria restante: desconexão e reconexão do Mercado Pago na tela, com conta real.
5. Publicado no commit `9c71b99`: avisos de alteração, cancelamento e remoção chegam também a inscrições pendentes e aprovadas; a trava de desconexão do Mercado Pago não perde ingressos futuros em contas com mais de 2.000 pedidos.
6. Publicado no commit `0d1c37b`: desconectar o Mercado Pago pausa a venda em vez de liberar inscrição gratuita com QR, e reconectar retoma a venda. Validado offline, sem conta real.
7. Publicado no commit `ffa1fd0`: "Pedir para participar" não fazia nada para quem tinha presença confirmada ou lista de espera sem pagamento em evento pago. Agora vira pedido pendente e o QR não pago é revogado. Validado com servidor e navegador reais em banco descartável (13/13), desktop e 390 px. Pagamento Pix real segue sem teste.
8. Na branch, aguardando OK para deploy: em evento pago, QR, leitura e entrada manual exigem pedido PAGO, e vaga liberada não promove a lista de espera sem pagamento. Validado offline. A quantidade de inscrições antigas afetadas em produção não foi medida.

## Riscos e dependências externas

- A migração usa a trava do Prisma, que ficou presa em 22/11. Se o build falhar com P1002, é preciso encerrar a sessão presa no painel do banco.
- Split real depende de a aplicação do Mercado Pago estar habilitada como marketplace e de cada organizador autorizar via OAuth. Ainda não houve compra real de teste.
- Cron da Vercel está diário; por isso os lembretes também rodam quando usuários consultam notificações. Precisão por minuto exige cron mais frequente.
