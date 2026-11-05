# Keepalive do Render gratuito

O workflow `.github/workflows/keepalive.yml`, na raiz do repositório Git, consulta `https://eventmap-socket.onrender.com/healthz` a cada dez minutos, nos minutos 03, 13, 23, 33, 43 e 53 de cada hora UTC. Também permite execução manual por `workflow_dispatch`. Ele não faz checkout, não usa segredos e não recebe permissões no repositório.

O endpoint existente em `server.mts`, no modo `SOCKET_ONLY=true`, responde a `GET /healthz` com HTTP 200 e corpo vazio. O handler não consulta banco nem exige autenticação. Os workers do processo têm suas próprias conexões com o banco; o endpoint verifica somente se o servidor HTTP responde. Por isso, uma resposta 200 não certifica chat, Neon ou entrega de notificações.

Cada tentativa tem timeout de conexão de dez segundos e duração máxima de noventa segundos. Há até duas novas tentativas para falhas transitórias, limitadas por uma janela de 180 segundos e pelo timeout de quatro minutos do job. O passo falha se a resposta final não for HTTP 200. O comando foi executado contra produção e recebeu HTTP 200 em 05/11/2026.

O agendamento só funciona quando o arquivo está na branch padrão, `main`, com Actions habilitado. Depois de integrar a alteração, abra **Actions → Render keepalive → Run workflow** e confira o resultado do job. Uma execução manual aprovada comprova o comando; acompanhe execuções futuras para verificar o cron. Para desativar, use **Actions → Render keepalive → Disable workflow**.

O GitHub pode atrasar execuções agendadas, especialmente em horários de pico, e pode descartar jobs enfileirados. Usar o minuto 03 evita o início da hora, mas não garante pontualidade. Em repositórios públicos, workflows agendados são desativados após sessenta dias sem atividade. Para retomar, habilite o workflow na interface e confira o próximo disparo. Esses limites impedem prometer disponibilidade contínua. [Agendamentos e atrasos](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows), [desativação por inatividade](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows).

O Render documenta hibernação após quinze minutos sem tráfego de entrada e uma franquia compartilhada de 750 horas gratuitas de instância por workspace a cada mês. A página consultada não esclarece explicitamente se pings externos destinados a impedir hibernação são permitidos. Este workflow não representa uma autorização do provedor nem uma garantia de serviço. Confirme as condições atuais com o Render antes de depender dele para disponibilidade. Ao esgotar as horas, o serviço pode ser suspenso até a renovação. [Limites do Render gratuito](https://render.com/docs/free).

Em 05/11/2026, a CLI autenticada encontrou três serviços web de plano `free`, todos com estado `not_suspended`, no workspace ativo:

| Serviço | Plano | Estado |
|---|---|---|
| eventmap-socket | free | Não suspenso |
| BH2 | free | Não suspenso |
| hitpoint-backend:latest | free | Não suspenso |

A consulta contabilizou serviços e planos, sem medir o saldo mensal restante. Um único serviço ligado continuamente consome 720 horas em trinta dias ou 744 horas em trinta e um dias. Assim, sobram apenas trinta ou seis horas para os demais serviços. Três serviços continuamente ativos excederiam a franquia compartilhada. O workflow consulta somente `eventmap-socket`; os outros serviços mantêm suas configurações. Nenhum recurso ou plano pago foi criado.

Como alternativa, é possível configurar manualmente um monitor HTTP(S) no UptimeRobot. Confira os limites e as condições do plano disponível na sua conta antes de salvar. Um monitor externo também está sujeito às regras e à franquia do Render. [Guia oficial do UptimeRobot](https://help.uptimerobot.com/en/articles/11358364-how-to-create-your-first-monitor-on-uptimerobot-quick-setup-guide).

1. Entre no UptimeRobot e selecione **Add New Monitor**.
2. Escolha o tipo **HTTP(s)** e o nome **EventMap Render health**.
3. Informe `https://eventmap-socket.onrender.com/healthz` e use o método **GET**, sem autenticação, cabeçalhos privados ou cookies.
4. Selecione intervalo de cinco ou dez minutos conforme as opções gratuitas da conta. Use verificação de status HTTP 200; o endpoint tem corpo vazio, portanto não configure busca por palavra-chave.
5. Se houver ajuste de timeout, considere o tempo de retomada do Render. Selecione os seus contatos de alerta e revise o plano antes de criar o monitor.
6. Salve e confira a primeira verificação. Para encerrar os pings, pause ou exclua apenas esse monitor. Se optar por ele como alternativa ao Actions, desative o workflow para evitar verificações redundantes.
