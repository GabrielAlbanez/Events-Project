# EventMap — aplicação web

Descoberta de eventos por mapa e agenda, inscrições, comunidade e conversas em tempo real.

**[Veja a apresentação completa, capturas e arquitetura no README principal](../README.md).**

- [Site em produção](https://events-project-lake.vercel.app/)
- [Demonstração guiada sem cadastro](https://events-project-lake.vercel.app/demonstracao)
- [Configuração, execução e testes](../README.md#executar-localmente)
- [Guia técnico e fluxos detalhados](docs/guia-desenvolvimento.md)
- [Arquitetura](docs/architecture.md)
- [Auditoria de produção](../AUDITORIA.md)

O código Next.js fica nesta pasta. Execute os comandos npm aqui, não na raiz do monorepositório. Para frontend, Socket.IO e workers locais juntos, use `npm run dev:socket` após configurar o ambiente e aplicar as migrações no banco de desenvolvimento.
