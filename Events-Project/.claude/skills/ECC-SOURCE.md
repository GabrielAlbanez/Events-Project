# Skills de terceiros (ECC)

Origem: https://github.com/affaan-m/ECC, commit 3f14a10, licença MIT.
Copiadas sem alteração, exceto `security-review`, renomeada para `ecc-security-review` para não sobrepor o comando nativo `/security-review`.

Observações para este projeto:
- As skills `motion-*` usam `motion/react`; aqui o pacote instalado é `framer-motion` (mesma API). Não adicione `motion` como dependência; importe de `framer-motion` e siga `components/animations/config.ts`.
- `prisma-patterns`: nunca rode `prisma migrate dev`/reset contra banco real; siga as regras de migração do AGENTS.md.
- AGENTS.md e `.codex/frontend-agent.md` têm prioridade sobre estas skills.
