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

## Toque e passagem para o mapa — 10/10/2026

Branch `feat/home-logada-toque-e-mapa`, base `main` em `601546f`. Um commit por item; sem push ou merge.

1. `0b01036`: perspective(800px) nos três keyframes do carrossel. Scroll-snap, overflow, controles e versão desktop preservados.
2. `4ba0132`: ingressos com perspective/rotateX/scale leves via view(block), sem sobreposição. Foco estabiliza o ingresso. Sem suporte e com movimento reduzido, leitura estática.
3. `389e7b3`: títulos por linha no toque via view(block). Opacidade permanece 1; deslocamento máximo de 8px e margem de recorte de 12px preservam legibilidade no primeiro paint e sem JavaScript.
4. `df558c9`: ilustração esmaece até 35% e chega a zoom 1.16 no fim. Cortina decorativa contida nos últimos 120px do fechamento, não interativa, somente desktop depth. Ordem mapa ilustrado → agenda → fechamento → mapa real mantida. CTA/foco/scroll suave preservados. Nada é aplicado ao Google Maps real.
5. Diagnóstico de movimento abaixo: mecanismo original mantido, conforme o critério de não refatorar sem benefício comprovado.

### Diagnóstico de desempenho

Existem **6 useScroll e 5 useSpring**, com offsets e parâmetros intactos. Na cena inicial, três pôsteres e suas cópias, anel, plano, três pins, três ingressos, fechamento e até oito linhas somam um teto estático de 24 criações de timer numa atualização conjunta. Isso não significa 24 timers em todo frame: depende de quais progressos mudam e das linhas já reveladas.

Chrome headless, 1440 × 900, seis eventos/três ingressos sintéticos, scroll interno de 6s seguido de acomodação das molas:

- Perfil inicial instrumentado: 9.558 timers criados, 9.536 cancelados, máximo 14 criações/frame, aproximadamente 10,3 por RAF; 10.196 escritas de transform e 9.344 de will-change em 925 RAFs.
- Protótipo de um RAF agrupado/um timer: 36 criações, zero cancelamentos durante o scroll. Era uma redução de alocações, mas a instrumentação de stacks interfere nos tempos de CPU.
- Comparação independente **sem instrumentação**, alternando original/protótipo, com os mesmos valores visuais do item 4 e 6s de scroll + 2s de acomodação:

| Métrica CDP (média de 2 execuções) | Original | Protótipo |
| --- | ---: | ---: |
| TaskDuration | 3,269 s | 3,299 s |
| ScriptDuration | 1,111 s | 1,163 s |
| RecalcStyleDuration | 0,829 s | 0,798 s |
| RAFs durante o scroll | 1.068,5 | 1.073,5 |

A amostra não demonstrou redução consistente de CPU. Não representa um benchmark em dispositivo físico nem prova de ausência de gargalo em todas as máquinas. **O protótipo foi retirado antes do commit**; não há helper, dependência ou mudança nos timers de produção. Os hints originais são removidos depois que as molas param.

### Validação e limites

- Itens 1–4: lint sem avisos, TypeScript, build e ambos os verify-logged-home scripts passaram em cada etapa. Último gate executado também para o item de diagnóstico.
- Chrome/Playwright: 16 combinações de 1440/820/390/320px × claro/escuro × com/sem movimento reduzido; zero erros JavaScript e zero rolagem horizontal externa.
- Foco visível e scroll-snap confirmados no carrossel. Foco deixa ingressos de toque estáveis; links da home mantêm área mínima de 44px. Um botão global de notificações existente mede 42px de largura: está fora da home modificada e foi preservado.
- Cortina recortada dentro do fechamento, pointer-events none; destino do mapa permanece sem transform. CTA chega a #home-discovery e devolve o foco ao destino. Hints limpos depois do término real das molas.
- Oito linhas de títulos visíveis com JavaScript desativado. Screenshots de hero, carrossel, ingressos e fechamento conferidos.
- Fixtures, baseline temporário e seus tipos gerados removidos. Nenhum hook de dados, API, banco ou arquivo de mapa foi alterado. Nenhuma imagem nova.

A prévia usa composição da apresentação e componentes reais de cena/agenda/pôster, dados sintéticos e sessão/inscrições simuladas. O destino de mapa na prévia é um placeholder: o Google Maps real foi protegido por comparação estática de app/page.tsx, não por um teste de integração externo.

Ainda conferir com conta real: recomendações personalizadas, eventos salvos, carregamento de banners remotos, inscrições e CheckInPass para CONFIRMED, além de toque em aparelho físico e fallback em navegador sem view-timeline.