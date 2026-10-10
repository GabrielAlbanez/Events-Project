# Refino da home logada

Branch feat/home-logada-refino, base main 3ecadff. Sem push ou merge.

## Etapas
1. Agenda: sobreposição desktop, abertura ligada ao scroll, banners com fallback, recortes no canhoto e destaque do próximo evento. Mobile e reduced-motion mantêm leitura estática. Inscrições e check-in intactos. Lint, TypeScript e build passaram.

O teste verify-logged-home-refinement compara os efeitos e chamadas da agenda, o mapa real, home visitante, tokens, fontes e regras completas de iluminação com a base.
2. Pôsteres: seis fallbacks distribuídos por posição; hero e anel usam o mesmo índice de evento. Banners reais preservados. Lint, TypeScript, build e teste de fontes/fallbacks passaram.
3. Carrossel mobile/tablet: rotateY e scale ligados à posição com view(inline), somente em @supports e sem movimento reduzido. Lint, TypeScript e build passaram.
4. Hero → anel: camada decorativa de voo, medidas fora do loop de animação, transform/opacity e cleanup de resize/observer/refs. Luzes preservadas. Lint sem avisos, TypeScript e build passaram.
5. Mapa ilustrado: zoom curto até 1.09 no último trecho; CTA e Google Maps real intactos. Lint, TypeScript e build passaram.
6. Títulos: máscaras por linha e translateY por scroll; texto visível no SSR, linhas já visíveis não são escondidas na hidratação e toque/reduced-motion continuam estáticos. Lint, TypeScript e build passaram.
7. Fechamento: parallax/zoom discreto do título e brilho, sem mudar cores/opacidade; will-change removido ao parar e no cleanup. Lint sem avisos, TypeScript e build passaram.

## Revisão de acessibilidade
Links dos títulos têm área mínima de 44px. A pilha desktop reserva espaço lateral para sua abertura e fica à frente do plano mesmo durante a inclinação, mantendo os canhotos clicáveis. Nenhum destino, dado ou regra de inscrição foi alterado.

## Arquivos
LoggedHomePresentation.tsx, LoggedHomePoster.tsx, LoggedHomeAgenda.tsx, LoggedHomeAgenda.module.css, LoggedHomeScrollScene.tsx e LoggedHomeScroll.module.css. Verificações: scripts/verify-logged-home-refinement.cjs e scripts/verify-logged-home-posters.cjs. Nenhuma imagem nova ou dependência adicionada.

## Validação visual
Playwright/Chrome: desktop 1440px, celulares 390px e 320px e tablet 820px, todos nos temas claro e escuro. Sem erros JavaScript ou rolagem horizontal; seis fallbacks distintos; três banners carregados; todos os links dos ingressos clicáveis e com área mínima de 44px. Apenas CONFIRMED apresentou o componente de check-in. Voo, zoom ilustrado, títulos, fechamento e ViewTimeline do carrossel responderam ao scroll. Movimento reduzido removeu os efeitos; oito linhas de títulos permaneceram legíveis sem JavaScript.

A prévia usou dados sintéticos e respostas de sessão/inscrição simuladas, sem gravar no banco. Os fixtures foram removidos e useLoggedHomeData.ts restaurado byte a byte. A validação não substitui o teste com uma sessão real e inscrições reais.
