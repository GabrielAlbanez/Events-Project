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
