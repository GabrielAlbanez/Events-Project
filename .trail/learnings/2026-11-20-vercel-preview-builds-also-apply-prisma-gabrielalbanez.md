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
  - Events-Project/scripts/migrate-on-production.cjs
  - Events-Project/lib/prisma.ts
  - Events-Project/scripts/verify-tickets.cjs
---

## Decided
- Treat every pushed branch as able to migrate the production database: the Vercel dashboard Build Command is `npm run prisma:generate && npx prisma migrate deploy && npm run build`, and preview deployments use the same DATABASE_URL. The paid-highlight migration was applied by the branch preview build, before main was deployed.
- Keep migrations additive and backward compatible so an early preview apply can't break the live site.
- Slow "Conectando ao vivo" is a Render free-tier cold start (30-60 s), not client code: warm, the socket connects in about 1.7 s from page load (measured with CDP on production).
- The scheduled workflow `.github/workflows/keepalive.yml` (cron every 10 min) actually ran every 3.5-10 hours (last 30 runs, Nov 2026); GitHub throttles schedules, and Render sleeps after 15 idle minutes.
- The client now pings `/healthz` on app load (`lib/socketClient.ts`) to start the wake-up earlier; the real fix is an always-on host (Render paid plan) or an external 5-minute uptime monitor.
- The production runtime connects with EVENTMAP_PRODUCTION_DATABASE_URL, but `prisma migrate deploy` reads DATABASE_URL, which on Vercel points to a different database created by the Prisma Postgres integration. The migrate step now passes EVENTMAP_PRODUCTION_DATABASE_URL as DATABASE_URL and aborts the build if it is missing.
- Root cause found after the paid-highlight and ticket migrations "applied" in build logs but the live site failed: registration GET 500 (missing `events.ticketsEnabled`) and /ingressos failing (missing `ticket_orders`). The three pending migrations then applied to the real database on the next deploy.

## Watch out
- `scripts/migrate-on-production.cjs` only migrates when VERCEL_ENV=production, but the dashboard command runs `prisma migrate deploy` first in every environment. To restrict migrations to production, set the dashboard Build Command to `npm run prisma:generate && npm run build`.

In the code: `scripts/migrate-on-production.cjs`, `package.json` (build script), `prisma/migrations/20261120120000_event_promotions/migration.sql`
- A green "All migrations have been successfully applied" in Vercel build logs does not prove the live database changed; check which URL the runtime uses.
- Never select new columns in hot paths (registration state) before confirming the migration reached the runtime database.

In the code: Events-Project/scripts/migrate-on-production.cjs, Events-Project/lib/prisma.ts, assertion in Events-Project/scripts/verify-tickets.cjs (checkWiring).

## Tried and ruled out
- Lowering client timeouts or reconnection delays: the first polling request simply waits for the host to boot, so it doesn't make the cold start shorter.

In the code: `lib/socketClient.ts`, `.github/workflows/keepalive.yml`, `server.mts` (/healthz)
