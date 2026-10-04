# ShowList — Session Handoff

> Living document. The **end of every session** must update this file:
> set the status line, fill in "Last session summary", and list any deviations
> from the plan or unresolved issues. The **start of every session** reads this
> first (after `project-brief.md` and `build-plan.md`).

## Status

**Session 5 — Improvements sweep (branch `improvements`): COMPLETE, awaiting user verification.**
All five roadmap phases (see `ROADMAP.md`) are implemented on the
`improvements` branch as granular commits; `main` is untouched. The user
tests the branch, decides what to keep, then the branch is merged (or
pruned via rebase/cherry-pick) into `main`.

## Session 5 summary — Improvements sweep (2026-10-04)

Ran on branch `improvements` (baseline commit `3e114e5` on `main` first:
user's WIP drawer redesign + agent docs). Phases:

1. **Episodes backend** (`e550bdc`): `tmdbCache` table + internal batch
   read/write (`convex/tmdb_cache.ts`, module names can't contain hyphens);
   `tmdb.details` extended with tv `seasons`, `nextEpisode`, `lastEpisode`,
   `status` and now cached (12h TTL, reader-checked); `tmdb.tvSeason`
   returns one season's episodes (24h TTL); `episodeWatches` table +
   `convex/episodes.ts` (`listForShow`, `listMine`, `toggle`, `setSeason`);
   marking an episode lazily creates the item doc with `watching: true`;
   `deleteIfFullyUnset` never deletes an item that has episode ticks.
2. **Episodes UI** (`d4c11b3`): `components/episodes-section.tsx` in the
   details drawer — season chips (defaults to airing/most recent season),
   episode rows with stills/air dates/runtimes/one-tap ticks, per-season
   mark-all/clear, unaired dimmed, per-season fetch cache with retry.
3. **Schedule** (`843dc5d`): `convex/schedule.ts` action reads the shared
   cache with a 6h freshness rule, fetches stale summaries + active-season
   episode lists in chunks of 6, windows [today,+30d] upcoming / [-8d,today)
   catch-up computed against the client's local date; ScheduleTab groups
   rows under day headings with watched ticks; refetch keys off the show-id
   set, not item mutations.
4. **AI features** (`a44d151`): `lib/ai.ts` — OpenAI-compatible client
   (OpenAI/OpenRouter/Gemini/custom), config in localStorage only
   (`useSyncExternalStore`, hydration-safe); settings dialog in the header
   (signed-in); Describe mode on home (sparkle toggle swaps the search bar);
   For You on Discover (explicit Generate — the user's key/calls cost
   money, nothing auto-runs); extracted `useItemStateMap` /
   `useCollectionSummaries` hooks.
5. **Discover redesign** (`50af7d6`): trending hero (backdrop + wordmark
   logo + facts + action row + drawer), Top 10 ranked trending row, ShowCard
   (full overlay + drawer) replaces inert DiscoverCard everywhere;
   `ItemActions` + `DetailsDrawer` extracted to their own modules.
6. **Sweep** (this commit): schedule rows open the details drawer (real
   state/collections via shared hooks); For You made explicitly
   user-triggered; advisor audit written to `plans/README.md` (tests,
   cache eviction cron, schedule 200-show cap surfacing, setSeason guard);
   README rewritten.

**Verified:** backend via `npx convex run` with mock identity (details
returns seasons/next/last; toggle round-trip + watching flag; schedule
returns [] for ended shows and full upcoming lists for a daily show).
`pnpm typecheck`, `pnpm lint`, `pnpm build` all clean; convex deploys clean.
**Not verified in-browser (Clerk bot challenge blocks automation):** the
signed-in UI flows — the user walks these on the branch.

**Known issues / warnings for next session**

- Two QA docs on the dev deployment owned by mock identity
  `https://qa.example.com|qa-s3`: the old "QA-Test" collection and a
  "Breaking Bad" item with `watching: true` from episode-toggle testing.
  Invisible to real users; delete via dashboard if desired.
- The schedule, episodes UI and AI features all assume `tmdbCache` payloads
  written by BOTH `tmdb.details`/`tvSeason` and `schedule.get` stay shape-
  identical — they share `normalizeDetails`/`normalizeSeasonEpisodes` from
  `convex/tmdb.ts`; don't fork those normalizers.
- Something occupies port 3000 locally; `pnpm dev` lands on 3001.
- User constraint: no global installs; no subagents (account limit) — the
  improve-skill audit was run inline instead of fanning out.

## Previous status

**Session 3 — Collections + polish: COMPLETE, user-verified, committed.**
**Session 4 — Collections tab redesign: COMPLETE, user-verified, committed.**
The user-requested redesign (collection cards grid replacing the tab
dropdown) is implemented and confirmed working by the user in the browser
("it works and looks great"). Backend verified against the dev deployment;
`pnpm typecheck` + `pnpm lint` + `pnpm build` all pass. The project is
complete.

## Session 4 summary — Collections tab redesign (2026-07-27)

User-requested redesign, all choices confirmed with the user up front
(cover-crop mosaic, muted folder icon for empty collections, back row with
name + count):

- **Backend** (`convex/collections.ts`): `listMine` now also returns
  `itemCount` and `previewPosters` (poster paths of the up-to-4 most
  recently added items, most recent first; `null` = item has no poster).
  Verified via `npx convex run --identity`: counts and poster order correct;
  QA data cleaned up afterwards.
- **Collections tab** (`components/app-shell.tsx`): the dropdown composition
  is gone — the tab is a plain trigger showing a grid of landscape
  (`aspect-video`) collection cards (1 col mobile / 2 sm / 3 lg). Each card
  face is a poster mosaic (`CollectionMosaic`): 1 item fills the card, 2 side
  by side, 3 = full-height left + stacked right, 4+ = 2×2 grid of the most
  recent four. Tiles are cover-cropped centered windows (`object-cover`);
  posterless items show the image-not-found icon tile; empty collections
  show a muted folder icon face. Caption below matches item cards: name +
  "N items".
- **Create card**: first grid cell is always a dashed-border card-sized
  button (plus icon + "Create") opening the existing create dialog. Creating
  stays on the cards view (the new card appears reactively) — the old
  auto-select-on-create behavior was removed with the dropdown.
- **Detail view**: clicking a card swaps the pane to that collection's item
  grid with a back row above it — ghost "← Back" button far left, then the
  collection name and item count. Back returns to the cards view; switching
  tabs also resets to the cards view (`selectedCollectionId` cleared in the
  Tabs `onValueChange`).
- `lib/media.ts`: added `CollectionPreview` (= `CollectionSummary` +
  `itemCount` + `previewPosters`). The card popover in `show-card.tsx` is
  unchanged (previews are a structural superset of summaries).

## Session 3 summary

Session 3 (2026-07-27) built:

- **Collections backend** (`convex/collections.ts`): `listMine`, `getItems`
  (items of one collection, most recently added first), `create` (trims name,
  rejects empty, returns the new id), `addItem` (lazy-creates the item doc
  like the toggles, idempotent on duplicates), `removeItem` (deletes the
  membership then runs the cleanup rule). All auth-scoped; `getItems`/
  `addItem`/`removeItem` verify collection ownership. Extra query
  `listMemberships` returns every (collectionId, itemId) pair for the user so
  the card popover can render checkbox state from one small reactive query.
- **Shared Convex helpers** (`convex/helpers.ts`, new): `requireUserId`,
  `findItem`, `deleteIfFullyUnset`, `itemDocValidator` moved out of
  `items.ts` so `collections.ts` reuses them (no behavior change).
- **Collections tab dropdown** (`components/app-shell.tsx`): the Collections
  tab trigger is a `DropdownMenuTrigger render={<TabsTrigger/>}` composition
  (Base UI render prop) — clicking it opens the menu ("Create collection" on
  top, then the user's collections, name-sorted) and re-clicking reopens it
  to switch. Selecting a collection renders its grid (`collections.getItems`
  via new `CollectionGrid`) and relabels the tab "Collection – {name}".
  Collections pane with nothing selected shows a pick/create hint.
- **Create dialog** (`components/create-collection-dialog.tsx`, new): shared
  modal (name input + Create, submit-on-Enter, disabled while empty/saving).
  From the tab dropdown, creating selects the new collection; from the card
  popover, creating also adds that card's title to the new collection.
- **Overlay Collections popover** (`components/show-card.tsx`): the
  Collections button is now live — active state (filled variant + swapped
  `FolderCheckIcon`) when the title is in ≥1 collection; popover lists "New
  collection" then checkbox rows per collection (checked = member; toggling
  calls `addItem`/`removeItem`). Card overlay outside-click/Escape handlers
  now ignore interactions inside portaled popover/dialog layers so using the
  popover doesn't dismiss the overlay.
- **Polish**: loading skeletons (shadcn `skeleton`) for search and all grids
  replace the "Loading…/Searching…" text; empty states on all panes;
  removed the Session 2 placeholders ("Collections are coming next" pane,
  disabled Collections button). `ItemState` (lib/media.ts) now carries
  `itemId` + `collectionIds`; added `CollectionSummary`.
- shadcn `dropdown-menu`, `dialog`, `popover`, `checkbox`, `skeleton` added
  via `pnpm dlx shadcn@latest add` (base-ui primitives, no new deps).
- Ran `pnpm format` (prettier) across the repo — cosmetic wrap in `tmdb.ts`.

**Verified:** `pnpm typecheck`, `pnpm lint`, `pnpm build` all clean; convex
deploy clean. Backend checklist via `npx convex run --identity` (mock
identity): create ✓, addItem lazy-creates the item doc ✓, listMemberships
returns the pair ✓, getItems returns the item ✓, removeItem deletes the
membership and the cleanup rule deletes the fully-unset item doc ✓, getItems
under a different identity is rejected ✓. Landing page verified in browser:
renders correctly, no console errors.

## Deviations from plan / decisions made mid-build

- Added `collections.listMemberships` (not in the planned surface) so the
  popover checkboxes come from one reactive query instead of per-item calls.
- `removeItem` takes `itemId` (not a TMDB snapshot) — removal only ever
  applies to items that already have a doc.
- Micro-UX choices the plan left open: creating from the tab dropdown
  auto-selects the new collection; creating from a card's popover auto-adds
  that title to the new collection.
- Collection selection state (`selectedCollectionId`) persists while
  searching/switching tabs; the tab keeps its "Collection – {name}" label.
- Shared Convex helpers extracted to `convex/helpers.ts` (registers no
  functions).

Carried over from Sessions 1–2 (all still true):

- `setSentiment` toggles server-side (mutual exclusion in one place).
- Active overlay buttons use the filled `default` variant + swapped icon
  (hugeicons free set has no filled variants). **User-approved — keep.**
- Client queries are `"skip"`-ed until Convex auth is ready.
- `collections.createdAt` dropped from schema — Convex's `_creationTime`
  covers it.
- `identity.tokenIdentifier` (not `subject`) is the `userId` value everywhere.
- Clerk⇄Convex uses the dashboard "Convex integration activation".
- Shared card/item types live in `lib/media.ts`.
- eslint ignores `convex/_generated/**`.

## Known issues / warnings for next session

- Clerk dev instance shows a Cloudflare "Verify you are human" challenge on
  sign-up; automated browser verification of signed-in flows is not possible.
  Backend can be tested with `npx convex run <fn> '<args>' --identity '<json>'`.
- One leftover QA doc in the dev deployment: a "QA-Test" collection owned by
  mock identity `https://qa.example.com|qa-s3` (there is no delete-collection
  function — parked feature). Invisible to real users; delete via dashboard
  if desired.
- Something occupies port 3000 locally, so `pnpm dev` lands on 3001 (a dev
  server may already be running — check before starting another).
- User constraint: **no global installs, no changes outside this workspace.**

## Session log

| Session | Date | Result |
|---|---|---|
| Planning | 2026-07-26 | Brief, build plan, handoff created. |
| 1 | 2026-07-26 | Complete. Backend wired, search + cards working, user-verified. |
| 2 | 2026-07-26 | Complete. Items backend + overlay + tabs + drawer, user-verified. Added drawer backdrop + action row on user request. Committed. |
| 3 | 2026-07-27 | Complete. Collections feature + polish, user-verified in browser. Committed. |
| 4 | 2026-07-27 | Complete. Collections tab redesign (cards grid + mosaic + detail view), user-verified in browser. Committed. |
| 5 | 2026-10-04 | Complete. Improvements sweep on `improvements` branch (episodes, schedule, AI, discover redesign, audit). Awaiting user verification, then curated merge. |

