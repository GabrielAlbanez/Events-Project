# Correção das fotos no túnel

Base: main 3ecadff. Nenhum dado, schema, upload ou configuração do mobile foi alterado.

| Página/componente | Causa | Correção |
| --- | --- | --- |
| Sidebar, perfil, promotores e organizador do evento | URLs malformadas e origens privadas precisam de tratamento consistente | ProfileAvatar valida fonte, usa origem do site para mídia compartilhada e mostra iniciais em erro |
| ChatHeader, ChatList, MessageBubble | ChatAvatar entregava URL privada diretamente ao navegador | Componente central, mantendo aparência e props |
| Conexões, formulário e participantes | PartyAvatar ignorava normalização; mídia mobile usa também /v1/media/events | Componente central e rota de leitura autenticada |
| Admin/UserTable | HeroUI renderizava algumas fotos fora do componente central | ProfileAvatar dentro do fallback do avatar HeroUI |
| Prévia da foto | img sem fallback | Componente central com suporte a blob |
| ProfileImage | Sem referências no projeto | Removido |

A rota party-profile-media exige sessão válida e referência em PartyProfile. O próprio usuário pode ver sua foto; terceiros precisam passar por pairAccess (perfis ativos, inscrição válida, evento disponível, compatibilidade e ausência de bloqueio). Respostas são privadas e no-store. Assets avulsos não são entregues. O otimizador Next não é utilizado nessa rota, pois sua busca não transporta o cookie do usuário.

O middleware existente não intercepta as rotas de mídia e permaneceu intacto. Os domínios permitidos no Next não foram ampliados. Fotos de hosts não listados usam unoptimized; falhas mostram iniciais.

Validação: lint, TypeScript e build passaram. verify-profile-media, verify-profile-avatars e verify-party-profile-media passaram. Uma foto real respondeu image/jpeg HTTP 200 pelo localhost e pelo túnel usando /api/profile-media; sua origem privada na API mobile estava inacessível. Testes de autorização utilizaram mocks, sem escrever no banco. A sessão real de conexões deve ser conferida ao disponibilizar esta branch para navegação autenticada.
