---
title: Vercel preview builds also apply Prisma migrations to the shared database
author: GabrielAlbanez
date: 2026-11-20
branch: codex/animacoes-20261119
id: l-9a5ff168
scope: repo
status: active
src: agent
touches:
  - ".github/workflows/keepalive.yml"
---

## Decided
- Treat every pushed branch as able to migrate the production database: the Vercel dashboard Build Command is `npm run prisma:generate && npx prisma migrate deploy && npm run build`, and preview deployments use the same DATABASE_URL. The paid-highlight migration was applied by the branch preview build, before main was deployed.
- Keep migrations additive and backward compatible so an early preview apply can't break the live site.
- Slow "Conectando ao vivo" is a Render free-tier cold start (30-60 s), not client code: warm, the socket connects in about 1.7 s from page load (measured with CDP on production).
- The scheduled workflow `.github/workflows/keepalive.yml` (cron every 10 min) actually ran every 3.5-10 hours (last 30 runs, Nov 2026); GitHub throttles schedules, and Render sleeps after 15 idle minutes.
- The client now pings `/healthz` on app load (`lib/socketClient.ts`) to start the wake-up earlier; the real fix is an always-on host (Render paid plan) or an external 5-minute uptime monitor.

## Watch out
- `scripts/migrate-on-production.cjs` only migrates when VERCEL_ENV=production, but the dashboard command runs `prisma migrate deploy` first in every environment. To restrict migrations to production, set the dashboard Build Command to `npm run prisma:generate && npm run build`.

In the code: `scripts/migrate-on-production.cjs`, `package.json` (build script), `prisma/migrations/20261120120000_event_promotions/migration.sql`

## Tried and ruled out
- Lowering client timeouts or reconnection delays: the first polling request simply waits for the host to boot, so it doesn't make the cold start shorter.

In the code: `lib/socketClient.ts`, `.github/workflows/keepalive.yml`, `server.mts` (/healthz)
