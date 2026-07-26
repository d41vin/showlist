# ShowList — Session Handoff

> Living document. The **end of every session** must update this file:
> set the status line, fill in "Last session summary", and list any deviations
> from the plan or unresolved issues. The **start of every session** reads this
> first (after `project-brief.md` and `build-plan.md`).

## Status

**Session 1 — Foundation: COMPLETE and user-verified.** Next up: Session 2 — Core
actions (overlay + tabs + drawer). Signed-in search verified working by the user;
Clerk's Convex integration is enabled in the Clerk dashboard.

## Last session summary

Session 1 (2026-07-26) built:

- **Convex⇄Clerk wiring**: `convex/auth.config.ts` (reads `CLERK_JWT_ISSUER_DOMAIN`,
  applicationID "convex"); `components/convex-client-provider.tsx`
  (`ConvexProviderWithClerk`) nested inside `ClerkProvider` in `app/layout.tsx`.
  Deployment env vars set on dev deployment `useful-porcupine-904`:
  `CLERK_JWT_ISSUER_DOMAIN=https://full-hornet-45.clerk.accounts.dev`, `TMDB_API_KEY`.
- **Schema** deployed (`convex/schema.ts`): items / collections / collectionItems
  with all indexes.
- **TMDB actions** (`convex/tmdb.ts`): `search` (multi-search filtered to movie/tv)
  and `details`; both require auth; supports v3 key or v4 bearer token.
  `searchResultValidator` is exported for reuse by Session 2 mutations.
- **UI**: nav with wordmark + Clerk controls (`app/layout.tsx`); landing page for
  signed-out and `AppShell` for signed-in (`app/page.tsx`); debounced (400ms) search
  with stale-response guard (`components/app-shell.tsx`); base card
  (`components/show-card.tsx`, kebab inert); shadcn `input` added;
  `image.tmdb.org/t/p/**` allowed in `next.config.ts`.
- Verified: typecheck + lint clean; convex deploy clean; landing page verified in
  browser (no console errors). Signed-in search NOT yet user-verified.

## Deviations from plan / decisions made mid-build

- `collections.createdAt` dropped from schema — Convex's `_creationTime` covers it.
- Per Convex guidelines, use `identity.tokenIdentifier` (not `subject`) as the
  `userId` value in Session 2+ mutations/queries.
- Clerk⇄Convex now uses the dashboard "Convex integration activation"
  (dashboard.clerk.com/apps/setup/convex) instead of manually creating a JWT
  template; the template must be named/result in audience "convex" either way.
- Shared card/item type lives in `lib/media.ts` (`MediaItem`, `tmdbPosterUrl`).
- eslint now ignores `convex/_generated/**`.

## Known issues / warnings for next session

- Clerk Convex integration is ENABLED (user did this in the Clerk dashboard);
  `CLERK_FRONTEND_API_URL` was added to `.env.local` and `.env.example`.
- Something occupies port 3000 locally, so `pnpm dev` lands on 3001.
- User constraint: **no global installs, no changes outside this workspace.**

## Session log

| Session | Date | Result |
|---|---|---|
| Planning | 2026-07-26 | Brief, build plan, handoff created. |
| 1 | 2026-07-26 | Complete. Backend wired, search + cards working, user-verified. |
| 2 | — | — |
| 3 | — | — |
