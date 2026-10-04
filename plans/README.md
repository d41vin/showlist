# Improvement plans (advisor pass)

Adapted from the shadcn `improve` skill methodology (read-only audit →
self-contained plans an executor can implement later). The 2026-10-04
session audited the `improvements` branch after Phases 1–4, implemented
the high-leverage items directly, then — per the "keep going" mandate —
also implemented **plans 1 and 2** the same day (tests + cache eviction,
commit history below). Plans 3–5 remain open.

Verification gate for every plan: `pnpm typecheck && pnpm lint &&
pnpm vitest run && pnpm build` must pass, and `npx convex dev --once`
must deploy clean.

## Prioritized findings

| # | Area | Finding | Priority | Status |
|---|------|---------|----------|--------|
| 1 | tests | No automated tests for episode tracking, cleanup rule, schedule windows | High | **Done 2026-10-04** |
| 2 | performance | `tmdbCache` table grows unbounded (no eviction) | Medium | **Done 2026-10-04** |
| 3 | ux | Schedule silently caps at 200 shows | Medium | Open |
| 4 | robustness | `episodes.setSeason` bulk insert has no transaction-limit guard | Low | Open |
| 5 | security | AI key in localStorage is readable by any XSS | Low (inherent to BYOK-in-browser) | Open (direction) |
| 6 | tech-debt | `lib/media.ts` mixes URLs, dates and domain types | Low | Open |

## Plan 1 — Backend tests for episodes, cleanup and schedule windows ✅

Implemented on 2026-10-04:
- Dev deps: `convex-test`, `vitest`, `@edge-runtime/vm`; `vitest.config.ts`
  with `environment: "edge-runtime"`; `convex` npm package bumped
  1.42.3 → 1.46.0 (convex-test 0.0.60 requires `CommitTsPlaceholder`).
- `convex/schedule-windows.ts`: window math extracted from schedule.ts
  into pure functions (`parseDayMs`, `isUpcoming`, `isRecent`) — note the
  underscore filename (Convex forbids hyphens in module paths).
- `convex/episodes.test.ts` (5 tests): toggle lazy-create + watching flip,
  un-tick leaves flags intact, setSeason mark/clear, episode ticks keep the
  item doc alive through the cleanup path, listMine projected shape.
- `convex/schedule_windows.test.ts` (8 tests): strict date parsing,
  window boundaries (day 0/30/31, day -1/-8/-9).
- convex-test 0.0.60 API note: `withIdentity(identity)` returns a scoped
  client — no callback form. `import.meta.glob` needs a cast (vite types
  are transitive-only under pnpm).

## Plan 2 — tmdbCache eviction cron ✅

Implemented on 2026-10-04: `convex/crons.ts` — weekly internalMutation
deleting `tmdbCache` entries older than 30 days by `_creationTime` in
500-doc batches, self-rescheduling via `ctx.scheduler.runAfter` when a
batch fills. Eviction is correctness-neutral (a refreshed-but-old entry
just refetches on next read).

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
