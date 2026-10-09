# Home autenticada

Branch: feat/home-logada-3d, baseada em main 26911df. Sem push ou merge.

## Seções
- Hero: saudação/data/nome da sessão, três banners reais em camadas, luzes e partículas discretas.
- Recomendações: ações existentes e rankRecommendedEvents; até seis eventos futuros, sem duplicatas. Anel desktop; carrossel scroll-snap no toque.
- Mapa ilustrado: plano SVG e rota revelada; CTA com foco e scroll para #home-discovery. Nenhum efeito dentro do Google Maps.
- Agenda: groupSavedEvents, até três próximos salvos. Inscrição consultada apenas ao aproximar a seção, com timeout/abort/retry; CheckInPass existente somente para CONFIRMED. Não apresenta ingressos comprados ou QR fictícios.
- Fechamento: brilho decorativo e CTAs reais.

## Arquitetura e estados
app/page.tsx conserva efeitos, busca, filtros, mapa, lista e header. A sessão em carregamento recebe apresentação neutra; authenticated recebe a nova composição; unauthenticated recebe HomePresentation original. A arquitetura da home já é Client Component: nome, data local e ações personalizadas resolvem após hidratação. Pôsteres têm dynamic import com SSR habilitado; somente o controlador de movimento usa ssr:false. Não houve mudança de providers, API ou autenticação.

Transform/opacity são escritos via motion values; índice do anel só atualiza ao mudar de card. Os movimentos decorativos param fora de vista. Cleanup remove transforms e will-change, inclusive a revelação da rota. Reduced-motion mantém conteúdo estático; mobile usa interação horizontal e atualiza o painel ao deslizar. Estados de loading, vazio, erro e retry não inventam dados. Distâncias são omitidas sem localização confiável.

## Imagens
public/branding/posters/poster-1.webp a poster-6.webp: arte abstrata original, 600 × 800, 31.486 a 51.238 bytes cada. Seleção determinística por ID, somente quando banner ausente/inválido/falha. Sem imagens externas de terceiros, novas fontes ou dependências.

## Validação
As cinco etapas receberam npm run lint, npx tsc --noEmit --incremental false e npm run build antes de cada commit. Revisão final corrigiu sincronização do carrossel, prontidão dos refs, posição do aviso de erro e cleanup da rota.

Testes visuais locais com fixtures: desktop, celular 390px e reduced-motion, temas claro/escuro; sem erro JS nem overflow horizontal. Exercitados salto/foco ao mapa, carrossel e inscrições CONFIRMED/WAITLISTED/CHECKED_IN (check-in somente para confirmado). Fixtures removidas. verify-personal-agenda.cjs passou. O mapa, guest home, tokens globais e dependências foram comparados com main e preservados.

Ainda conferir manualmente com uma conta real: recomendações pessoais, salvos, permissões do check-in e banners remotos, usando as integrações existentes. Nenhuma alteração foi aplicada ao checkout original com trabalho local em andamento.
