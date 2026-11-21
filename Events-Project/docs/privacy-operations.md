# Privacidade e operação do EventMap

Responsável publicado: Gabriel Albanez. Canal informado pelo responsável: gabriel.g.albanez@gmail.com. Projeto de portfólio: isso não autoriza tratar dados reais sem finalidade. Evitar usar dados sensíveis ou de terceiros em demonstrações; preferir dados fictícios identificados como demonstração.

## Configuração e publicação

`lib/privacy.ts` contém apenas identificação/contato públicos, com overrides server-side `PRIVACY_CONTROLLER_NAME` e `PRIVACY_CONTACT_EMAIL`. Nunca usar credenciais SMTP como fallback. `/privacidade` e `/privacidade/solicitacoes` são públicos. O formulário prepara um e-mail no dispositivo; somente o envio pelo aplicativo de e-mail abre o atendimento. Não há protocolo eletrônico automático nem caixa postal criada pelo código.

A base de produção já contém classificação etária, acessibilidade e condições de participação. Somente `organizerName` exige a migração aditiva `20261109170000_event_practical_information` antes de executar o novo código contra o banco. Não inserir informações inventadas nos eventos existentes. Confirmar com organizador/fonte oficial e editar pelo painel. Conta que publica não é automaticamente o organizador.

## Inventário técnico

| Finalidade | Dados/tecnologia | Escolha e conservação |
|---|---|---|
| Conta, sessão e segurança | Nome, e-mail, hash de senha, perfil Google, tokens OAuth/NextAuth e cookies de segurança | Necessários à conta solicitada; não exportar hashes/tokens ao titular. Sessão JWT conforme NextAuth. Verificação de e-mail válida 24h, recuperação 30min; expiração não significa exclusão física imediata. |
| Navegação | Cookie sidebar:state, preferência de tema | Sidebar 7 dias; tema até remoção pelo usuário. |
| Rascunhos | localStorage do evento por conta | Recuperação válida por 7 dias; não promete remoção de bytes sem abrir/limpar o navegador. Não inclui arquivos de imagem. |
| Maps/Places/Routes | IP/dados técnicos, endereço pesquisado, origem/destino no cálculo | Bloqueado inicialmente; ativação por aba em sessionStorage eventmap:maps-enabled. Geolocalização só por ação e permissão separadas. Revogação recarrega a página. Não persiste coordenadas na preferência; coordenadas do local do evento podem integrar cadastro público. |
| Métricas | Contadores agregados por evento/dia; cookie de deduplicação eventmap_metric_* | Opt-in, servidor exige eventmap_metrics=yes. Cookies de contagem 1h; escolha 180 dias. Revogação bloqueia novas contagens e pede exclusão dos cookies HttpOnly. Contagens históricas agregadas não são atribuídas a contas. |
| Comunidades/conexões | Textos, votos, perfis, interesses, imagens, denúncias, presença | Participação conforme recurso. Conexões exigem participação opcional e declaração de maioridade existente. Verificar conteúdo que possa revelar dado sensível; não presumir que interesse legítimo cobre dado sensível. |
| E-mail/push | Endereço, token do link, endpoint/chaves de inscrição push | Transacional e ativação de push conforme recurso. Sem finalidade de marketing introduzida nesta entrega. |
| Infraestrutura | Hospedagem, PostgreSQL, armazenamento/mídia e logs de acesso | Confirmar provedor, região e contrato no ambiente publicado. Não ler/publicar .env. Vercel é observada no domínio, mas fornecedor/região do banco não foram certificados. |

Google OAuth é acionado pelo botão de login; não é controlado pela preferência Maps. Imagens Google de perfis podem ser obtidas no servidor/proxy; não afirmar que a preferência interrompe todo tratamento pelo Google. Fontes de eventos e links de ingresso são destinos externos. Não foram adicionados Google Analytics, pixels de anúncio ou publicidade.

## Bases e registro de atividades

Manter registro por finalidade com responsável, categorias, destinatários, origem, conservação, controles e base legal. Conta e participação solicitadas podem exigir execução contratual/procedimentos a pedido; segurança e prevenção de abuso exigem avaliação documentada de necessidade e proporcionalidade; consentimento específico é usado nas escolhas opcionais de mapas e métricas. Obrigações legais e exercício regular de direitos devem ser concretos, nunca justificativa genérica para reter tudo. Validar enquadramento com profissional jurídico; avaliar art. 11 para conteúdos sensíveis e art. 14 se houver crianças/adolescentes. Aplicabilidade de regras adicionais para público menor exige avaliação antes de direcionar o produto a esse público.

## Procedimento de atendimento

1. Acompanhar o e-mail de privacidade e registrar data, categoria do pedido e responsável em registro privado com acesso restrito; não adicionar pedidos/dados pessoais ao Git.
2. Confirmar recebimento e verificar identidade proporcionalmente, preferindo o e-mail já verificado da conta. Nunca pedir senha, token de sessão ou documento por padrão. Não divulgar se outra pessoa possui conta.
3. Localizar dados de conta/perfil, inscrições/favoritos, eventos publicados, notificações/push, chats/conexões, imagens e prestadores. Separar dados de terceiros e segredos de autenticação de uma eventual cópia.
4. Para acesso/confirmação, observar art. 19: resposta simplificada imediata ou declaração completa em até 15 dias. Esse prazo não deve ser aplicado cegamente a todos os direitos. Registrar a conclusão e fundamentar eventual impossibilidade.
5. Correção: permitir perfil pelo fluxo existente ou executar alteração autorizada após verificação. Exclusão é análise de escopo, não banimento punitivo; explicar efeitos como perda de inscrições e conteúdo vinculado. O fluxo administrativo existente possui cascatas que podem apagar eventos e conversas associados; revisar dependências antes de usar.
6. Se houver impedimento/obrigação de conservar, informar categorias, base concreta, acesso restrito e duração aplicável. Não presumir que todo histórico exige retenção. Encaminhar pedidos a operadores quando necessário.
7. Ao concluir, registrar somente evidência mínima de atendimento. Revisar esse registro em 90 dias; eliminar o conteúdo que não seja mais necessário ou justificar prazo adicional. Não há rotina automática que prometa essa eliminação.

## Conservação e exclusão: procedimento adotado

Revisão manual mensal pelo responsável; não há tarefa automática implantada. Critérios por categoria:

- Conta e conteúdo: conservar durante uso necessário e atender término/pedido verificado. Projeto de portfólio deve encerrar cadastros de teste quando concluída a avaliação, após avisar participantes quando apropriado. Não apagar contas reais ou pendentes de tratamento por inferência.
- Mensagens, conexões e mídia: revisar necessidade após encerramento do evento ou pedido. Remover o escopo autorizado e referências/cópias em disco; excluir linha no banco não garante exclusão do arquivo. Conteúdo/denúncia com preservação necessária deve ter acesso restrito e justificativa individual.
- Tokens: remover tokens e sessões expirados na manutenção controlada; invalidação já é aplicada pelo fluxo. Não criar prazo de retenção arbitrário para dados que não possuem data de criação.
- Imagens públicas sem referência: `npm run uploads:cleanup` é inventário sem exclusão. `--apply` só após revisão e autorização da operação. O comando existente preserva arquivos recentes (<24h) e revalida referências. Não cobre sozinho `.private-uploads/chat`: cruzar filename com CommunityEntry de kind party.image e limpar apenas após revisão. Não executar varreduras destrutivas em produção durante desenvolvimento.
- Históricos administrativos: IDs em EventHistory/ImpersonationSession podem sobreviver à conta; avaliar necessidade, anonimização e justificativa. Não declarar eliminação total sem conferência.
- Backups: o responsável deve confirmar janela real do provedor, limitar restauração/acesso e manter registro de exclusões pendentes para reaplicá-las antes de reabrir uma restauração. Prazo desconhecido não equivale a apagamento imediato nem autoriza retenção ilimitada; publicação final requer esse levantamento.

Não há limpeza automática ou exclusão de dados pessoais nesta entrega. A política pública descreve esses limites sem prometer exclusão automática. A migração aditiva de organizador é uma operação separada, autorizada pelo usuário para a publicação.

## Reconexão e infraestrutura

A base efetivamente publicada (main 68b3664) usa Vercel para a aplicação e um processo persistente Render para Socket.IO, com NEXT_PUBLIC_SOCKET_URL e tickets assinados emitidos por /api/socket-ticket. Essa arquitetura foi preservada integralmente. Não foi aplicada a desativação de Socket.IO da entrega local antiga, que partia de outra versão do código.

Probe externo confirmou healthz HTTP 200 e conexão Socket.IO anônima em cerca de 797ms. Isso comprova disponibilidade naquele instante, não garante ausência de partidas frias ou entrega privada. O aviso agora distingue conexão inicial de indisponibilidade após 45 segundos, oferece tentativa manual e limpa timers ao conectar. A reconexão automática e os controles de autenticação não foram desativados. O healthcheck não certifica banco, workers ou notificações.

Tempo real exige manter Render, origens permitidas e tickets configurados. Não copiar cookies ou segredos para o cliente, não substituir tickets por uma URL sem autenticação e não presumir que Vercel Functions hospedem o listener. Os hooks de consulta de fallback existentes foram preservados. A agenda também oferece atualização manual.

## Referências

- LGPD atualizada: https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html
- Orientação de cookies ANPD: https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_cookies_e_protecao_de_dados_pessoais
- Limitação de WebSocket em Functions: https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections

Os documentos e controles são uma melhoria técnica, não certificação LGPD. Revisão jurídica, contratos/regiões dos operadores, plano de incidentes e verificação real da caixa de e-mail permanecem responsabilidades operacionais.
