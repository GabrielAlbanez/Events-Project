# Performance — Next.js 14.2.35

## Diagnóstico

Projeto com App Router, React 18 e npm. O principal candidato à compilação lenta
é o barrel `@heroui/react`, usado em telas e no provider global. HeroUI, Google
Maps e animações aparecem no relatório do bundle como dependências relevantes.
`qrcode` também fazia parte do carregamento inicial embora só fosse usado após clique.

Não há configuração Babel nem loaders Webpack customizados. TypeScript já usa
`incremental: true`; os includes abrangem o código e tipos gerados dos dois diretórios
de build. Não foi encontrada necessidade de alterar esse escopo.

As fontes já usam `next/font/local`. Várias imagens já usam `next/image`; converter
as demais exigiria verificar previews blob e origens externas. Os Client Components
inspecionados dependem de hooks, sessão, formulário ou mapa. Retirar suas diretivas
sem separar responsabilidades mudaria o fluxo.

`cookies()` no layout preserva o estado da sidebar e torna as páginas dinâmicas.
Alterar esse comportamento ou adicionar cache a dados de conta/administrativos
exige uma análise funcional separada.

## Mudanças e reversão

1. `next.config.mjs`: `experimental.optimizePackageImports: ['@heroui/react']`.
   Limita os imports aos módulos utilizados. Para reverter, remova essa propriedade.
   Lucide e Lodash já são otimizados pelo Next14 por padrão.
2. `ClientProviders.tsx`: o provider vem de `@heroui/system`, dependência direta já
   existente, em vez do barrel de toda a UI. Para reverter, volte a origem do import
   para `@heroui/react`.
3. `CheckInPass.tsx`: `import('qrcode')` dentro do fluxo de geração. Carrega a biblioteca
   após solicitar o QR, com erro e loading existentes. Para reverter, restaure o
   import estático no início do arquivo.
4. Analisador oficial `@next/bundle-analyzer@14.2.35`, habilitado só com `ANALYZE=true`.
   `npm run analyze` gera `.next/analyze/client.html`, `nodejs.html` e `edge.html`.
   Para reverter, remova o wrapper/import da configuração, o script `analyze` e a
   dependência de desenvolvimento; atualize o lockfile com npm.

## Medições em 01/10/2026

| Métrica | Antes | Depois |
| --- | ---: | ---: |
| `npm run build`, duração total | 107,61 s | 33,89 s |
| First Load JS — descoberta `/` | 295 kB | 286 kB |
| First Load JS — evento `/eventos/[id]` | 159 kB | 151 kB |
| First Load JS — agenda `/EventsCreated` | 410 kB | 402 kB |
| First Load JS — organizador `/promotores/[id]` | 123 kB | 114 kB |
| First Load JS — usuários `/admin` | 381 kB | 382 kB |
| First Load JS — criar evento `/CriarEvento` | 399 kB | 399 kB |

Os tamanhos são os valores gzip apresentados pelo Next. Parte do código de QR foi
adiada para um chunk separado; não foi removida da aplicação. O build final reutilizou
cache de compilação, então a diferença de duração não comprova ganho equivalente
no primeiro acesso em desenvolvimento. Não foi iniciado servidor para medir dev,
respeitando o pedido de mantê-lo parado. Build e `tsc --noEmit --incremental false`
passaram em cada etapa; permanece apenas um warning de lint preexistente.

## Turbopack e validação local

Next14 habilita Turbopack com `next dev --turbo` e o classifica como beta.
`npm run dev:socket` usa um servidor customizado que também fornece Socket.IO.
Substituir esse comando pelo CLI comum retiraria esse servidor do fluxo, por isso
Turbopack não foi habilitado no comando padrão. Uma integração diferente deve ser
aprovada e validada com login, logout e WebSocket antes de substituir o fluxo atual.

Para comparar dev localmente, use sempre `npm run dev:socket`, o mesmo conjunto de
rotas e caches equivalentes. Registre os tempos de `Compiled ...` no terminal;
latência de banco e rede não é tempo de compilação. Não compare primeira execução
sem cache com navegação já compilada. Para o QR, confirme presença e clique em
**Mostrar QR Code para entrada**, verificando geração e erro de rede no navegador.

## Documentação oficial consultada

- [Imports otimizados no Next14](https://nextjs.org/docs/14/app/api-reference/next-config-js/optimizePackageImports)
- [Bibliotecas sob demanda](https://nextjs.org/docs/14/app/building-your-application/optimizing/lazy-loading)
- [Bundle Analyzer](https://nextjs.org/docs/14/app/building-your-application/optimizing/bundle-analyzer)
- [Turbopack no Next14](https://nextjs.org/docs/14/architecture/turbopack)
- [Checklist de produção](https://nextjs.org/docs/14/app/building-your-application/deploying/production-checklist)
