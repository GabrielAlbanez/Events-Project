# Scroll 3D da home

## Referências e adaptação

- [Apple / AirPods](https://www.apple.com/airpods-pro/): apresentação em etapas, conteúdo fixo durante trechos da rolagem e destaque para a imagem do produto. Aqui, o produto é o evento e seu cartaz.
- [Lusion](https://lusion.co/): referência de narrativa visual e composição em profundidade. A home usa os banners dos próprios eventos, sem objetos abstratos.
- [ScrollTide](https://www.scrolltide.co/): referência de galerias, cards e composições controladas pela rolagem. Implementação própria, sem importar templates ou arquivos de terceiros.
- [Lenis](https://lenis.dev/): referência de fluidez. O projeto mantém o controlador de inércia que já existia, sem instalar outra biblioteca.

## Experiência

`Hero fixo → cartazes avançam em profundidade → galeria com perspectiva → destaques/agenda → plano ilustrado → mapa real`

- Desktop com mouse, largura mínima de 1100px e altura mínima de 700px: hero e galeria com trechos sticky; posição, escala e rotação respondem ao scroll nos dois sentidos.
- Galeria com um evento: destaque largo, centrado, sem repetir o evento para preencher a interface.
- Toque e telas menores: conteúdo em fluxo normal e carrossel horizontal com scroll-snap; inclinação leve conforme a posição dos cards.
- Movimento reduzido: sem controlador de movimento, sem trechos sticky extensos e conteúdo estático acessível.
- A prévia do mapa é ilustrativa. Seus links usam eventos reais, mas os pins não representam coordenadas, distâncias ou rotas reais. O Google Maps continua na seção seguinte.

## Dados e limites

Recomendações, banners, preços, datas, sessões e agenda continuam usando os fluxos existentes. Nenhuma imagem adicional ou dependência foi necessária. O mapa real, filtros, lista lateral, APIs e banco não foram alterados.

`LuxuryHomeScrollScene.tsx` atualiza apenas transform e opacity nos elementos de apresentação. Há um requestAnimationFrame sob demanda e um timer compartilhado para limpar will-change. Scroll, resize e foco agendam atualizações; não há loop de movimento quando a página está parada. Listeners, observers, timers e estilos são limpos ao desmontar ou ativar movimento reduzido.

## Validação

As verificações de interface usam o servidor local, os eventos disponíveis e fixtures de navegador para seis eventos, resposta vazia e falha de carregamento. Fixtures não gravam dados no banco. Foram conferidos movimento reversível, teclado, movimento reduzido, ausência de movimento ocioso, atalhos para eventos/mapa, erros de JavaScript e rolagem horizontal.

A agenda autenticada, recomendações pessoais, inscrições e check-in ainda exigem conferência com uma conta real. Seus módulos e contratos foram preservados.
