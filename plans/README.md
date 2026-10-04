# Improvement plans (advisor pass)

Adapted from the shadcn `improve` skill methodology (read-only audit →
self-contained plans an executor can implement later). The 2026-10-04
session audited the `improvements` branch after Phases 1–4 and implemented
the high-leverage items directly; the findings below are the ones
**deliberately not implemented** — each plan is self-contained so any
session (or agent) can pick it up without this conversation's context.

Verification gate for every plan: `pnpm typecheck && pnpm lint && pnpm build`
must pass, and `npx convex dev --once` must deploy clean.

## Prioritized findings

| # | Area | Finding | Priority |
|---|------|---------|----------|
| 1 | tests | No automated tests for episode tracking, cleanup rule, schedule windows | High |
| 2 | performance | `tmdbCache` table grows unbounded (no eviction) | Medium |
| 3 | ux | Schedule silently caps at 200 shows | Medium |
| 4 | robustness | `episodes.setSeason` bulk insert has no transaction-limit guard | Low |
| 5 | security | AI key in localStorage is readable by any XSS | Low (inherent to BYOK-in-browser) |
| 6 | tech-debt | `lib/media.ts` mixes URLs, dates and domain types | Low |

## Plan 1 — Backend tests for episodes, cleanup and schedule windows

**Context.** `convex/episodes.ts` (toggle/setSeason/ensureWatching),
`convex/helpers.ts` `deleteIfFullyUnset` (episode-progress guard added
2026-10-04), and `convex/schedule.ts` window math (`parseDayMs`, upcoming
`[today, +30d]`, recent `[-8d, today)`) have no tests. Regression here
corrupts user tracking data silently.

**Steps.**
1. `pnpm add -D convex-test vitest @edge-runtime/vm` (project-local).
2. `vitest.config.ts` with `environment: "edge-runtime"`.
3. `convex/episodes.test.ts`: use `convexTest(schema, import.meta.glob("./**/*.ts"))`
   (add `/// <reference types="vite/client" />` at top ONLY in test files).
   Cover: toggle inserts + lazy-creates item with `watching: true`; toggle
   again un-marks; setSeason marks all then clears; marking episodes keeps
   the item doc alive through `deleteIfFullyUnset` even when all flags off;
   `listForShow`/`listMine` return projected shapes (no `_id`).
4. `convex/schedule.test.ts`: extract `parseDayMs` + window constants into
   `convex/schedule-windows.ts` (pure functions, no action) and test
   boundary days (today, day 30, day 31, day -8, day -9, invalid strings).
5. Run `pnpm vitest run`.

**Done when:** all tests green; typecheck/lint/build pass.

## Plan 2 — tmdbCache eviction cron

**Context.** `convex/tmdb_cache.ts` upserts; nothing deletes. Docs are
small (one normalized payload each) but the table only grows.

**Steps.**
1. New `convex/crons.ts`: `cronJobs()` interval (e.g. weekly) running an
   `internalAction` that iterates `tmdbCache` by `_creationTime` and deletes
   entries older than 30 days in batches (guidelines: read a `.take(n)`
   batch, `ctx.db.delete` each, schedule continuation if more remain).
2. Register the cron in the same file; `npx convex dev` to deploy.

**Done when:** cron visible in dashboard; old entries deleted on manual run.

## Plan 3 — Surface the schedule 200-show cap

**Context.** `schedule.get` slices input ids to 200 (`convex/schedule.ts`).
A user with more TV shows sees a silently partial schedule.

**Steps.**
1. Return `{ entries, truncated }` from the action (validator change).
2. `components/schedule-tab.tsx`: when `truncated`, show a muted note:
   "Showing the first 200 shows — trim your lists to see more."
3. Update the `FunctionReturnType` consumers (schedule-tab only).

**Done when:** note renders for a >200-show library (simulate by calling
the action with 201 ids).

## Plan 4 — setSeason transaction guard

**Context.** `convex/episodes.ts` `setSeason` inserts one row per episode
in a single transaction. A >1000-episode season (specials compilations)
could hit write limits and fail the whole mutation.

**Steps.** Cap the episodes array at 2000 in the validator
(`v.array(v.number(), { max: ... })` is not supported — check length in the
handler and throw a friendly error), or split into two mutations the client
calls sequentially for oversized seasons.

**Done when:** oversized input fails with a clear message, not a
transaction error.

## Plan 5 — AI key strictness option (direction)

The settings dialog documents that the key is browser-local. A stricter
mode could offer "remember for this session only" (sessionStorage) or
in-memory. Only worth doing if users ask; the current tradeoff is the
standard BYOK-browser one.

## Direction ideas (not planned)

- Push/email notifications for schedule (needs a job + provider; big scope)
- "Continue watching" row on home from episode progress (per-show season
  position is already derivable from `episodeWatches`)
- Streaming-provider availability badges (TMDB watch/providers endpoint)
- Collection rename/delete (parked since session 3 in `project-brief.md`)
