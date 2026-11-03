# Confirmação por toast — 03/11/2026

## Resultado

Removida a confirmação fixa do perfil de conexões. Salvar com sucesso emite somente `Perfil atualizado.` em toast com role=status. Erros úteis continuam perto do formulário. O mesmo hook é usado no editor global e no evento, evitando duplicação da confirmação.

O AppToaster global reutiliza React-Toastify10.0.6 existente: superfície/tipografia/cores do tema, ícones Lucide, borda discreta, fechamento44px com foco, duração4s, pausa em hover/perda de foco, movimento reduzido e limite de notificações. Portal no body evita cortes/rolagem pelo main com backdrop-filter.

## Pesquisa e decisão

Sonner foi identificado como alternativa minimalista: https://github.com/emilkowalski/sonner . A personalização do sistema existente atende o pedido e preserva os demais usos sem introduzir duas bibliotecas nem migrar chamadas alheias. Referência oficial de personalização: https://fkhadra.github.io/react-toastify/how-to-style/ . Skill UI/UX Pro Max recomendou confirmação breve e transitória de3–5segundos.

## Arquivos

- hooks/useGlobalConnectionsProfile.ts: confirmação por toast, saveError separado, guards de identidade/cancelamento preservados.
- GlobalConnectionsProfile.tsx e PartyConnectionsHub.tsx: sem sucesso persistente; feedback de erro acessível.
- components/ui/AppToaster.tsx e AppToaster.module.css: apresentação compartilhada, tema e posicionamento responsivo.
- app/layout.tsx: usa AppToaster único.
- Dois harnesses de perfil/navegação: contrato atualizado e teste de toast único.

## Verificações

TypeScript, lint, suite party-connections e build passaram. O build final inclui o ajuste de largura percentual que preserva16px de margem mesmo com a barra de rolagem do Windows.

Harness executa o hook real e confirma um único sucesso, ausência de toast em falha/timeout/unmount/troca de conta e após unmount durante refresh. Dados do perfil real não foram alterados para QA.

Visual global inspecionado com mensagem fictícia pelo fluxo de erro existente do login na origem127.0.0.1, isolada da sessão real localhost. Sem criação de contas nem edição de perfis. Conferidos390/768/1440px, claro/escuro, ausência de overflow e fechamento44×44 efetivo. Clique Fechar notificação removeu o toast. Preferência reduced-motion revisada no CSS; não alternada no navegador. Viewport e tema da sessão de teste restaurados.

Prévia3100 ativa; atualizar uma vez a aba antiga para carregar o novo container global. Nenhuma dependência foi adicionada.
