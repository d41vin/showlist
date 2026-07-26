# ShowList — Session Handoff

> Living document. The **end of every session** must update this file:
> set the status line, fill in "Last session summary", and list any deviations
> from the plan or unresolved issues. The **start of every session** reads this
> first (after `project-brief.md` and `build-plan.md`).

## Status

**Session 2 — Core actions: COMPLETE and user-verified.** Next up: Session 3 —
Collections + polish. User confirmed toggles land in the correct tabs and the
overall flow works. Post-verification additions (user request): TMDB backdrop
image at the top of the details drawer, and the in-app action buttons as a
horizontal row under the type/year line in the drawer.

## Last session summary

Session 2 (2026-07-26) built:

- **Items backend** (`convex/items.ts`): `listMine` query (all my items via
  `by_user`); `toggleWatchlist`, `toggleWatched`, `setSentiment` mutations.
  All auth-scoped to `identity.tokenIdentifier`, all take a TMDB snapshot
  (`searchResultValidator` from `tmdb.ts`) for lazy create, all run the cleanup
  rule (`deleteIfFullyUnset`: no flags + no sentiment + no collection membership
  → delete doc). `setSentiment` toggles server-side: same value clears, other
  value replaces (mutually exclusive).
- **Card overlay** (`components/show-card.tsx`, now "use client"): hover overlay
  on desktop (CSS `group-hover`), click/tap opens persistently, closes on outside
  `pointerdown`/Escape; one open at a time via `activeCardKey` lifted to
  `AppShell`. Buttons: Watchlist, Watched (active = filled `default` variant +
  swapped icon), Collections (disabled until Session 3), liked/disliked icon
  pair. All wired to the mutations with the exact snapshot shape.
- **Tabs** (`components/app-shell.tsx`): shadcn `tabs` (Watchlist default |
  Watched | Collections "coming next" pane). Panes filter `listMine` client-side,
  sorted by `updatedAt` desc, with empty states. Tabs hidden while a search
  query is active; search results reuse the same `CardGrid` + state map
  (`mediaKey` = `mediaType:tmdbId`), so result cards show saved state.
- **Details drawer**: kebab opens shadcn `drawer` (fetches `tmdb.details` once
  per card, loading/error states; rating, runtime or seasons·episodes, release
  date, genres, tagline, overview). Post-verification additions: `tmdb.details`
  now also returns `backdropPath`; the drawer renders the backdrop (w780, with
  a pulse placeholder while loading) above the title, and the in-app action
  buttons render as a horizontal wrap row under the type/year line (centered on
  the bottom sheet, left-aligned from `md`). The overlay + drawer share the
  extracted `ItemActions` component (`layout="stack" | "row"`;
  `tmdbBackdropUrl` added to `lib/media.ts`).
- **Shared types** (`lib/media.ts`): added `Sentiment`, `ItemState`, `mediaKey`.
- shadcn `tabs` + `drawer` added via `pnpm dlx shadcn@latest add` (base-ui
  primitives, no new deps).

**Verified:** `pnpm typecheck` + `pnpm lint` clean; convex deploy clean. Backend
checklist verified against the dev deployment via `npx convex run --identity`
(mock identity, test data cleaned up by the cleanup rule itself): lazy create ✓,
both flags coexist ✓, sentiment exclusive + clears ✓, fully-unset doc deleted ✓,
`details` returns `backdropPath` ✓. Landing page loads with no console errors.
**User verified in browser:** toggles work and items appear under the correct
tab; icon direction (filled variant + swapped icon) explicitly approved — keep.

## Deviations from plan / decisions made mid-build

- Session 1 items kept as-is (see below).
- `setSentiment` takes the sentiment being clicked and toggles server-side
  rather than the client sending the computed next value — keeps the
  mutual-exclusion rule in one place.
- Active overlay buttons use the filled `default` button variant + swapped icon
  (hugeicons free set has no filled icon variants). **User-approved — keep.**
- `items.listMine` is skipped client-side (`"skip"`) until Convex auth is ready.

Carried over from Session 1:

- `collections.createdAt` dropped from schema — Convex's `_creationTime` covers it.
- `identity.tokenIdentifier` (not `subject`) is the `userId` value everywhere.
- Clerk⇄Convex uses the dashboard "Convex integration activation".
- Shared card/item type lives in `lib/media.ts` (`MediaItem`, `tmdbPosterUrl`).
- eslint ignores `convex/_generated/**`.

## Known issues / warnings for next session

- Clerk dev instance shows a Cloudflare "Verify you are human" challenge on
  sign-up; automated browser verification of signed-in flows is not possible.
  Backend can be tested with `npx convex run <fn> '<args>' --identity '<json>'`.
- Something occupies port 3000 locally, so `pnpm dev` lands on 3001 (a dev
  server may already be running — check before starting another).
- User constraint: **no global installs, no changes outside this workspace.**

## Session log

| Session | Date | Result |
|---|---|---|
| Planning | 2026-07-26 | Brief, build plan, handoff created. |
| 1 | 2026-07-26 | Complete. Backend wired, search + cards working, user-verified. |
| 2 | 2026-07-26 | Complete. Items backend + overlay + tabs + drawer, user-verified. Added drawer backdrop + action row on user request. Committed. |
| 3 | — | — |
