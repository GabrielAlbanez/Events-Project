# Perfil único de conexões — QA

## Entrega

Um perfil privado por usuário em `/perfil-conexoes`, separado da foto pública da conta. Salvar atualiza as participações existentes sem ativá-las. Entrar e sair continuam sendo escolhas por evento; matches e conversas mantêm o escopo do evento.

A migração aditiva `20261031150000_party_user_profile` foi aplicada ao banco de testes com autorização explícita. A importação usa o perfil mais recente como base marcada para revisão. A verificação da migração confirmou participações e matches anteriores preservados. Não houve nova migração nesta retomada.

## Verificações em 03/11/2026

- TypeScript da aplicação e servidor: passaram.
- Lint: passou sem avisos.
- `test:party-connections` e `test:features`: passaram.
- Build de produção: passou. A primeira tentativa encontrou EPERM ao criar artefatos `.next`; repetir com permissão de escrita apropriada resolveu o bloqueio do ambiente.
- Integração real com fixtures novas: passou em DB, HTTP autenticado e Socket.IO. Cobriu revisão, salvamento sem inscrição/opt-in, entrada explícita, saída isolada, compatibilidade, chat privado por evento, concorrência, origem, schema estrito, cache privado e invalidação em tempo real após edição global. O teste removeu seus próprios dados sem erro.
- A falha anterior em `http.save-global` não se reproduziu após reiniciar o servidor com acesso ao banco. Não foi feita outra alteração de produção para mascarar a resposta.
- Revisão da interface/hook por subagente: passou; ajuste `min-w-0` impede overflow de nomes longos na revisão. Teste do formulário passou após o ajuste.
- Conteúdo exato selecionado para o commit validado em cópia isolada, sem as mudanças locais de outras tarefas: TypeScript app/servidor, lint, as duas suites e build passaram. Esse build inclui o ajuste final de nomes longos.
- Consulta de limpeza após a integração: zero usuários e zero eventos temporários restantes.

## Revisão visual e limites

Editor global inspecionado no navegador em 390, 768 e 1440 px, temas claro e escuro. O perfil importado mostra revisão pendente; salvar e participar permanecem separados. Não foram salvos dados nem alterados consentimentos do usuário real durante o QA. Capturas evitam foto, bio e preferências privadas.

Os testes de navegador não substituem testes com leitores de tela ou uma auditoria completa de acessibilidade. Google OAuth, SMTP, mapa e aplicativo móvel não foram revalidados nesta feature. O aplicativo não foi modificado. O teste real usa contas temporárias via Credentials, sem reutilizar credenciais pessoais.

## Validação manual

1. Abra Minha conta → Perfil de conexões; revise e salve a base importada.
2. Confirme que salvar não inscreve nem ativa um evento.
3. Em um evento com inscrição confirmada, escolha Participar das conexões; em outro evento, confirme que a entrada continua opcional.
4. Edite o perfil e observe a atualização em outra sessão; depois saia de um evento e confirme que os demais permanecem ativos.
5. Confira matches/conversas no evento correto e a recusa de acesso fora dele.

Consulte `docs/party-global-profile.md` para contratos, migração e execução segura do teste de integração. Mudanças locais anteriores de outras tarefas foram preservadas fora do commit desta feature.
