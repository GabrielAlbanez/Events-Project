---
title: Vercel preview builds also apply Prisma migrations to the shared database
author: GabrielAlbanez
date: 2026-11-20
branch: codex/animacoes-20261119
id: l-9a5ff168
scope: repo
status: active
src: agent
---

## Decided
- Treat every pushed branch as able to migrate the production database: the Vercel dashboard Build Command is `npm run prisma:generate && npx prisma migrate deploy && npm run build`, and preview deployments use the same DATABASE_URL. The paid-highlight migration was applied by the branch preview build, before main was deployed.
- Keep migrations additive and backward compatible so an early preview apply can't break the live site.
## Watch out
- `scripts/migrate-on-production.cjs` only migrates when VERCEL_ENV=production, but the dashboard command runs `prisma migrate deploy` first in every environment. To restrict migrations to production, set the dashboard Build Command to `npm run prisma:generate && npm run build`.

In the code: `scripts/migrate-on-production.cjs`, `package.json` (build script), `prisma/migrations/20261120120000_event_promotions/migration.sql`
