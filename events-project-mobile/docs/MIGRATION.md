# Paridade do EventMap mobile com o site

O aplicativo usa Expo 57, React Native, TypeScript e a API mobile ligada ao mesmo PostgreSQL e às regras do site. Não foi criado outro banco nem modificado o schema nesta etapa.

## Funcionalidades disponíveis no código

| Área | Experiência mobile e ações |
| --- | --- |
| Descoberta e agenda | Pesquisa, categorias, gratuitos, preço máximo, períodos Hoje/Fim de semana/Este mês, data, limpar filtros, mapa Android, lista e detalhes |
| Detalhes do evento | Capa/galeria, datas/horários, capacidade, endereço, trajeto, organizador, compartilhamento, calendário ICS, favoritos e lembretes |
| Autenticação | Senha, registro, verificação/reenvio de e-mail, recuperação/redefinição, Google Android com cliente OAuth e certificado configurados |
| Perfil | Dados pessoais, senha, upload de foto, aparência e perfil público do organizador |
| Participação | Contagem pública de vagas, convite de login para visitantes, confirmação/lista de espera/cancelamento, QR e check-in da equipe |
| Eventos do organizador | Filtros de status, criação/edição com imagens, rascunho, envio para análise, duplicação, cancelamento, recorrência e histórico |
| Resultados | Visualizações, favoritos, cliques e indicadores diários; cliques não representam vendas |
| Comunidade | Avisos, programação, votação em enquetes, filas, perguntas/respostas/FAQ, tarefas com responsável e ajuda, achados/reivindicações/devolução, avaliações e equipe |
| Salas com amigos | Criação, convite e remoção de membros pelo proprietário, sugestões de eventos e votação |
| Conexões | Participação explícita por evento, fluxo foto/dados/interesses/revisão, descoberta, curtidas privadas, matches, saída, bloqueio e denúncia |
| Chat | Grupo/privado, histórico paginado, fotos, envio otimista com deduplicação/retry, anexos privados, digitando, recibos e reconexão |
| Notificações e atividade | Leitura individual/em lote, paginação, eventos, tarefas, filas e salas |
| Administração | Contas/permissões, avatar, presença Socket.IO, suspensão/exclusão, busca/paginação, seleção e aprovação/exclusão de eventos, denúncias e auditoria |
| Impersonação | Validação no servidor, bloqueio de administrador/alvo inválido, motivo, banner, saída, expiração e restauração da conta administrativa |

As autorizações permanecem no backend. Mostrar um botão não concede acesso a dados ou ações. Não há solicitação de exclusão por promotor no site atual: o aplicativo preserva cancelamento pelo organizador e exclusão pelo administrador.

## Diferenças e limitações

- A navegação usa tabs/stack, SafeArea e componentes nativos. Não replica DOM/Tailwind/Framer Motion diretamente.
- Calendário abre o arquivo ICS no site configurado; não exige permissão de calendário nativo.
- Push do sistema operacional ainda não implementado. As notificações internas e os sinais em tempo real continuam disponíveis quando o app está aberto.
- Google e Maps Android estão configurados para o pacote e certificado de desenvolvimento. Builds de produção precisam dos próprios certificados; iOS precisa de cliente OAuth, configuração Maps e validação em Mac/dispositivo iOS.
- O login Google foi aberto no emulador, mas a entrada real ainda depende da interação manual do titular. Não foi certificado login completo com conta Google nesta etapa.
- Upload e chat precisam da API, servidor Socket.IO e armazenamento acessíveis. A URL temporária do túnel pode mudar.
- Dois usuários em dispositivos reais, mensagens/anexos, reconexão, revogação, e-mail real, check-in físico e expiração de impersonação ainda exigem testes ponta a ponta autenticados.
- Não houve alteração de dados, migração ou criação de conta de teste nesta etapa de paridade.
- O diretório real do site permanece em `C:\Users\gabri\Events-Project`, preservado enquanto o site está rodando.

## Validação

TypeScript do app e lint dos arquivos de paridade foram executados com sucesso. O coordenador registra o resultado final de API, testes, exportação e instalação após integrar todos os agentes.

A execução Android pública e a exibição do mapa foram verificadas na etapa de configuração anterior; isso não certifica os novos fluxos autenticados. Nesta etapa de paridade não foram executados testes visuais completos ou login manual pelo agente responsável por esta matriz. Exportar iOS não equivale a compilar/instalar em iPhone.

Consulte `ANDROID_SETUP.md` para ambiente, API, Metro, emulador e VS Code. Nunca compartilhe arquivos `.env`, tokens ou credenciais.

### Integração final — 2026-10-06
- TypeScript aplicativo: aprovado.
- Lint global: aprovado, sem avisos.
- Testes do cliente: 14 aprovados.
- TypeScript e compilação da API: aprovados.
- Testes da API: 16 aprovados.
- Exportação de bundles Android, iOS e web: aprovada; não equivale a teste de dispositivo iOS.
- API reiniciada na porta 4000; site preservado.
- Métricas: deduplicação em memória por conta (ou rede anônima), com janelas de uma hora para visualização e um minuto para ingresso; o cache reinicia com o processo e visitantes na mesma rede compartilham a janela.
- Fluxos autenticados completos em dois dispositivos continuam sem validação ponta a ponta nesta etapa.
