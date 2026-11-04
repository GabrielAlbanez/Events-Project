# Validação e publicação do EventMap

## Prévia online

Use um serviço Node contínuo com HTTPS e WebSocket, conectado a um PostgreSQL exclusivo da prévia. Render Web Service é uma opção. O plano gratuito pode hibernar, portanto uma instância que permanece ligada é necessária para validar a busca recorrente sem tráfego. Use armazenamento persistente para uploads.

- Diretório do serviço no repositório: `Events-Project`.
- Build: `npm ci --legacy-peer-deps && npm run prisma:generate && npm run build`.
- Antes de iniciar, aplique `npx prisma migrate deploy` ao banco da prévia.
- Inicialização: `npm run start:socket`. Configure `HOSTNAME=0.0.0.0` e deixe o provedor definir `PORT`.
- Configure a origem HTTPS em `NEXTAUTH_URL`, `NEXT_PUBLIC_BASE_URL` e `SOCKET_IO_ALLOWED_ORIGINS`. Preencha os demais valores de `.env.example` no gerenciador de segredos do provedor. Restrinja a chave pública do Maps à origem da prévia e registre o callback Google para essa origem, se habilitado.

[Web Services](https://render.com/docs/web-services) · [WebSocket](https://render.com/docs/websocket) · [Disco persistente](https://render.com/docs/disks) · [Limites do serviço gratuito](https://render.com/docs/free)

## Critérios para publicação

1. Abra o painel com uma conta admin de teste e o site com outra conta, em sessão separada. Gere uma proposta de fonte oficial, confirme que não aparece na agenda, aprove-a e confira a entrada na agenda e no mapa.
2. Salve o evento como visitante. Gere um aviso de teste para essa conta e confirme que o banner aparece sem recarregar e abre o destino correto. Confira que a outra sessão não recebe esse aviso.
3. Em celular, teste login, busca, mapa, agenda e notificações. Confira também navegação por teclado e movimento reduzido.
4. Com automação ativa na prévia, anote o próximo horário e reinicie o serviço. Confirme reconexão do socket e persistência da fila e do horário. Valide uma execução após o reinício.

## Roteiro do portfólio

**0–10 s** — “Encontrar um evento pode exigir abrir várias agendas. O EventMap reúne a descoberta em um mapa.”

**10–30 s** — No painel, mostre a busca por cidade, uma proposta com link para a fonte e a aprovação individual.

**30–50 s** — Em outra sessão, mostre o mesmo evento no mapa, abra os detalhes e salve na agenda. Use uma conta de demonstração e mantenha nomes e dados privados fora da gravação.

**50–55 s** — Mostre a URL pública validada e o repositório. Grave somente depois de concluir os critérios acima.
