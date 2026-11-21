# Destaque pago de eventos (MVP com Pix manual)

## Por quê
Primeira fonte de receita do EventMap: organizadores pagam para o evento aparecer em destaque na agenda, na home e no mapa. Valida se há demanda antes de integrar gateway e ingressos.

## Decisões do usuário (2026-11-20)
- Pagamento: Pix manual + aprovação no admin. Sem gateway por enquanto.
- Pacotes: 3 dias = R$ 29,00; 7 dias = R$ 59,00 (constante única no código, fácil de mudar).
- Migração aditiva aplicada em produção no deploy (autorizada).

## Fluxo
1. Organizador (dono do evento, evento PUBLISHED e não encerrado) abre "Destacar evento" a partir de Meus eventos (`/myEvents`) ou da edição do evento.
2. Escolhe pacote → é criado um pedido `PENDING_PAYMENT`. A tela mostra valor, chave Pix (env server-side `FEATURED_PIX_KEY` + `FEATURED_PIX_NAME`; se ausente, mostra "Pagamento indisponível no momento" e não deixa criar pedido), um identificador curto do pedido para colocar na descrição do Pix e um botão "Já paguei" com campo opcional de observação (ex.: nome do pagador / ID da transação).
3. "Já paguei" → `AWAITING_REVIEW`. Admin recebe na fila.
4. Admin (`/admin/destaques`) vê pedidos aguardando, confirma ou recusa (motivo). Confirmar → `ACTIVE`, `startsAt=now`, `endsAt=now+days`. Se já houver destaque ativo no mesmo evento, o novo começa no `endsAt` do atual (empilha).
5. Organizador é notificado (modelo Notification existente) ao confirmar/recusar. Pode cancelar enquanto `PENDING_PAYMENT`.
6. Destaque ativo = status ACTIVE e startsAt <= agora < endsAt (calculado na leitura; sem cron).

## Onde o destaque aparece
- Agenda pública (`/EventsCreated`) e "Mais eventos" da home: eventos em destaque primeiro (entre si, por data), com selo "Destaque" discreto (cor CTA lime do tema) no card. No máximo 3 destaques no topo; o resto segue a ordem normal.
- Mapa: pin do evento em destaque com variação visual (maior/cor CTA) e zIndex acima. Sem animação contínua.
- Selo transparente: o card deve deixar claro que é patrocinado ("Destaque" com `aria-label="Evento em destaque patrocinado"`).

## Dados
Novo modelo `EventPromotion` (tabela `event_promotions`): id uuid, eventId → Events (cascade), userId → User (solicitante, cascade), packageId String, days Int, amountCents Int, status enum `PromotionStatus { PENDING_PAYMENT AWAITING_REVIEW ACTIVE REJECTED CANCELLED }`, payerNote String?, reviewNote String?, reviewedBy String? → User (SetNull), reviewedAt DateTime?, startsAt DateTime?, endsAt DateTime?, createdAt, updatedAt. Índices: (eventId, status), (status, endsAt). Relações inversas em Events e User. Migração SQL nova em `prisma/migrations/<timestamp>_event_promotions/` só aditiva.

## Segurança
- Toda escrita via server actions/rotas com sessão; dono do evento para criar/cancelar/"já paguei"; ADMIN para confirmar/recusar (seguir o padrão de checagem de admin existente). Validar com Zod em `schemas/`. Valor e dias sempre do servidor, nunca do cliente.
- Limitar: 1 pedido aberto (PENDING_PAYMENT/AWAITING_REVIEW) por evento; observação até 200 caracteres.
- Chave Pix só no servidor (sem NEXT_PUBLIC). Auditoria: registrar confirmação/recusa no mecanismo de auditoria do admin se houver um padrão simples.

## Fora de escopo
Gateway (Mercado Pago), cobrança recorrente, relatório de cliques do destaque, reembolso automático.
