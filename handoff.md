# ShowList — Session Handoff

> Living document. The **end of every session** must update this file:
> set the status line, fill in "Last session summary", and list any deviations
> from the plan or unresolved issues. The **start of every session** reads this
> first (after `project-brief.md` and `build-plan.md`).

## Status

**Session 8 — Home header rework + schedule weekly view (branch `improvements`): COMPLETE, awaiting user verification.**
User-directed pass on top of session 7.

## Session 8 summary — Home header rework + schedule weekly view (2026-10-18)

1. **Continue Watching removed** (`7f7af2a`): the row duplicated the Watching
   tab (every tile also appears there as a full card) and its "next episode"
   captions duplicate the Schedule tab's computation. Bonus: one fewer
   `schedule.get` action call per signed-in home load.
2. **One-row header** (`41cb107`): on md+ the tabs pill sits left and the
   search input right (compact `w-64`, AI sparkle still inside); type/sort
   filters are left-aligned under the tabs. While searching, the tabs stay
   visible and clicking a tab also clears the query (one-tap exit from
   search). The `Tabs` root now wraps the search row (TabsList must live
   inside it); the results branch is a plain `mt-8` div; AiDescribe still
   takes over the whole area. Search placeholder shortened to "Search…".
3. **Mobile** (< md): two stacked rows — full-width search on top (unchanged
   order), then the tab pill in a horizontally scrollable full-bleed wrapper
   (`-mx-6` + `hide-scrollbar`, `py-1` so the focus ring doesn't clip). This
   also fixes a pre-existing bug: the pill (~430px) silently overflowed small
   phones with no scroll handling. Top-nav search was considered and
   rejected: search is a home-page mode (results replace tab content, AI
   describe is welded to the bar), and the header slot is already occupied.
4. **Alignment follow-up** (user feedback): the tab pill kept its mobile
   `px-6` on md+ — reset with `md:px-0` so it sits flush with the content
   column; the top nav now wraps its content in the same
   `mx-auto w-full max-w-6xl px-6` container (border stays full-width), so
   wordmark/nav align with home and Discover content.
5. **Overflow follow-up** (user feedback): the one-row layout previously
   engaged at md (768px) where tabs + search left ~18px of slack — Windows
   font metrics overflowed it in the ~768–800px band (wrapper is
   overflow-visible there). The row/search/wrapper breakpoints moved from
   md to lg (1024px): one row only when it fits with real slack; below that
   the stacked layout applies (search capped `max-w-xs`, `sm:max-w-sm`,
   centered; tab pill full-bleed scrollable).
6. **Schedule weekly view** (`03ee71e`, user-directed): the "next 30 days"
   list + "Catch up" section are replaced by a Monday-start week view with
   free prev/next navigation and a "Back to this week" reset. Backend:
   `schedule.get` now takes `{tmdbIds, from, to}` and returns every episode
   airing in the range — window math reduced to `inRange` in
   schedule_windows (tests updated, 12 total). Candidate seasons: the
   next-episode season (when its next episode airs ≤ `to`) and the
   last-episode season (when it aired ≥ `from`) — this also lifts the old
   hidden 30-day cap, so hiatus shows now appear in future weeks. Known
   honest limit: past weeks across season boundaries can be sparse; the
   empty state says so. Provider-rail airing badges migrated to the range
   shape (window [today-8, today+30]; "New season" = any E1 in window).
   Monthly view discussed and parked — week navigation covers it. Smoke-
   tested via `npx convex run` (BB finale week returns "Felina"; empty
   weeks return []) and deployed clean.
7. **Discover polish** (`eaf00bd`, `7fde8a5`, user-directed): Netflix-style
   chevron arrows on every card rail for desktop (new `RailScroller` —
   wired into MediaRow [trending/popular/in-library], the provider title
   rails and the For You rows; buttons fade out at rail ends, mobile keeps
   pure swipe). The provider rail now defaults to the first service via a
   derived `picked ?? first` selection — tile clicks select (no
   toggle-off). Home mobile: gap below the search bar equalized with the
   gap below the tab pill (`gap-6 lg:gap-4`). Provider-list curation is
   pending the user's final pick list (full US movie-provider list pulled
   from TMDB and reported — duplicates are subscription vs store/channel
   variants).
8. **Streaming curation** (user-directed): the rail is exactly six services
   in display order — Netflix (8), Amazon Prime Video (9), HBO Max (1825,
   the Amazon Channel entry — TMDB has no direct Max id; display name
   overridden), Disney Plus (337), Apple TV (350, the Apple TV+
   subscription), Paramount+ (2303, the Premium tier). Tile logos are
   forced monochrome to match the theme (`brightness-0 dark:invert` —
   black in light mode, white in dark) and dim to 60% until hovered or
   selected, per the user's reference screenshot. Note: TMDB logos are
   fixed PNGs — recoloring only works via CSS filters, which is what this
   does. HBO Max's channel-variant logo needs an eyeball check; a
   logoPath override is the fallback if it looks off.
9. **Hero strip + tile fix** (user-directed): the hero is now a snap-paged
   billboard strip of the top FIVE trending titles (RailScroller with
   `snap-x snap-mandatory`, full-width pages; only page 1 loads eagerly).
   The mono-filter tile experiment failed — inspection showed TMDB's
   provider logos are opaque 154×154 squares (zero alpha), so the filters
   produced solid blocks. Tiles are now app-icon style: 56×56 rounded
   squares, logo filling the tile via object-cover, no filters, dim 60%
   until hover/selection. Provider sort order confirmed: TMDB discover
   `sort_by=popularity.desc` filtered by watch provider — popularity, not
   recency or trending.
10. **Hero + streaming polish** (`2a85c50`, `aa615c3`, `17cee28`, user-directed):
   hero backdrops now request w1280 (was w780 — the low-quality look was
   our request size, not TMDB's source). The hero strip autoplays one page
   every 8s while unhovered/visible, stops for good on first interaction
   (Netflix rule), skips autoplay under prefers-reduced-motion, and `loop`
   wraps both chevrons at the ends. The whole hero is clickable → details
   drawer (action row stops propagation; focusable with Enter/Space).
   Provider rail: sort Select (Newest default / Most popular / Top rated),
   curated list alphabetical, ring clipping fixed with a p-1 gutter, dim
   75%, HBO Max now uses the clean standalone TV-provider logo (1899) with
   per-type filter ids (movies 1825, TV 1899), Paramount+ shows a locally
   hosted clean crop (public/providers/paramount-plus.png). Settings
   popover replaces the separate theme toggle + AI settings buttons in the
   header (`components/settings-menu.tsx`; theme-toggle.tsx deleted).
11. **Card = details affordance** (user-directed, option A of the kebab UX
   discussion): clicking a ShowCard's poster or title opens the details
   drawer — the kebab button is gone. The hover overlay now carries only
   quick actions and stops propagation; on touch, a tap opens the drawer
   (full action row inside). The `overlayOpen` prop plumbing is kept but
   inert (the overlay is purely hover-driven) — cleanup candidate.
   Terminology of record: the drawer is DetailsDrawer ("details drawer"),
   the poster tile is ShowCard ("card"), the hover layer is the "card
   action overlay".

**Verified:** typecheck, lint, 12 vitest tests, build all clean. Signed-in UI
awaits user testing on the dev server (:3000).

## Previous status

**Session 7 — Seven-feature pass (branch `improvements`): COMPLETE, awaiting user verification.**
Builds on sessions 5–6; same branch, same verification gates.

## Session 7 summary — Seven-feature pass (2026-10-07)

Seven user-picked features, each its own commit, in the requested order:

1. **Trailers** (`9fc8e69`): new `tmdb.videos` action (`/{type}/{id}/videos`,
   server-side key, cached as `videos:{type}:{id}:v1`, 24h TTL) that picks
   ONE best YouTube video server-side (official Trailer → Trailer → Teaser,
   newest first; null when none). The drawer's action row gains "Play
   trailer" (only when a trailer exists); pressing it swaps the cinematic
   hero backdrop for an inline youtube-nocookie embed (autoplay) with a
   close button. Playback state is keyed by title, so drill-down/close drop
   out of playback without a reset effect. Failures stay quiet.
2. **Provider rail upgrades** (`b5ad14f`): Movies/TV toggle for the titles
   rail (title lists keyed `providerId:type`); "New season"/"New episode"
   badges on TV rail cards via one `schedule.get` call per rail (shared
   tmdbCache — cheap). Badge heuristic (documented in provider-rail.tsx):
   upcoming or last-aired episode is E1 of a season → "New season"; any
   other airing activity → "New episode". `ShowCard` gained an optional
   `badge` chip (top-left on the poster).
3. **Home list sort/filter** (`ecd34cc`): the Watchlist/Watched/Watching
   tabs share a MediaTypeToggle (type filter) + sort Select (recently
   added / Title A–Z / Year). "added" keeps each tab's per-status recency
   order; a filter that hides everything gets its own "No movies/shows in
   this list." empty message.
4. **In your library** (`8f08103`): while searching on home, titles already
   in the user's lists whose names contain the query render as an
   "In your library" MediaRow above the TMDB results (client-side
   substring match over `items.listMine`; no backend change).
5. **Export library** (`63116ff`): Export section on /stats — Download JSON
   (items + collections {id,name} + memberships + episode watches) and
   Download items CSV (14 columns incl. collection names, ISO timestamps,
   UTF-8 BOM for Excel), all generated client-side from the reactive
   queries (Blob + anchor download).
6. **Season mini-posters** (`c8d3df3`): the drawer's Episodes season chips
   show the season poster thumb from `data.seasons[].posterPath` before
   the label; chips without a poster keep the label-only look.
7. **Merged genre browse** (`c9eb379`): Discover with type "all" + a picked
   genre now runs BOTH discover queries (per-type genre ids resolved from a
   name-merged union of the movie+TV genre lists) and interleaves one grid
   (movie, tv, movie, …) with per-type "Load more" pagination — the
   auto-flip to Movies is gone. Genre select stores the genre NAME; ids are
   resolved per type at fetch time, so TV-only genres work in merged mode.

**Verified:** typecheck, lint, 13 vitest tests, build, convex deploys all
clean; `tmdb.videos` (movie + tv) and a TV-only-genre discover (id 10765)
smoke-tested via `npx convex run` with mock identity. Signed-in UI awaits
user testing.

**Decisions made mid-build**

- Trailer: single best video chosen server-side (no multi-trailer picker).
- Badge heuristic is premiere-based and state-blind (episode ticks are
  personal accounting — a watched show still gets badges when it airs).
- Merged genre list = movie list first, TV-only names appended; names that
  exist on both sides carry both ids.
- Export JSON keeps full item docs (incl. userId tokenIdentifier) — it's
  the user's own data, generated in their browser.

## Previous status

**Session 6 — Feature completion pass (branch `improvements`): COMPLETE, awaiting user verification.**
Builds on session 5; same branch, same verification gates.

## Session 6 summary — Feature completion pass (2026-10-05)

User decisions locked first: NO notifications / ratings / social / sharing
/ PWA; episode ticks stay personal accounting (Watched never auto-marks
episodes); AI stays explicit-generate. Then, per session scope:

1. **App polish** (`3f7f646`): `app/error.tsx` (this Next version uses
   `unstable_retry`, NOT `reset`), `app/not-found.tsx`, root metadata.
2. **Audit fixes** (`a22bd95`): schedule.get returns `{entries, truncated}`
   (cap surfaced in UI); episodes.setSeason rejects >2000 episodes.
3. **Drawer content** (`b774c34`): expandable episode synopses; "More like
   this" via native TMDB recommendations (cached 24h) with in-place
   drill-down (Back returns); optional `stateByKey` prop threads real
   saved state to drilled items (all call sites pass it).
4. **Continue Watching** (`27b2ade`): home row of shows marked Watching
   with next-episode captions; DetailsDrawer gained a render-prop trigger.
5. **Collections rename/delete** (`c19cdec`): mutations + kebab menu +
   dialogs; delete runs the item cleanup rule (cap 500).
6. **Browse filters** (`5c5c7b2`): tmdb.genres + tmdb.discover (genre/sort,
   vote-count floors); genre select switches Discover to a browse grid;
   All/Movies/TV chips filter search results on home + discover; shadcn
   `select` added.
7. **Provider rail** (`2f39d9f`): tmdb.watchProviders (US region, 30d
   cache); "Only on {service}" section between hero and tabs — logo tile
   rail, picking one shows that service's popular titles as ShowCards.
   tmdb.discover gained optional watchProvider + watch_region (US).
8. **Stats** (`e32508b`): /stats page — reactive counts + estimated watch
   time via stats.get (runtimes from the shared cache; TTL-checked; stale
   entries refetch and write back FULL drawer-compatible payloads — a
   minimal-payload cache-poisoning bug in schedule.ts was found and fixed
   here too: stale schedule refetches now include the images fetch).
9. **Drawer redesign** (`be0e1d5`): cinematic hero (16:9 backdrop fading
   into page background in both themes, left-aligned wordmark, meta line
   with show status, genre chips), md:max-w-2xl sheet, swiss uppercase
   section labels, per-season progress bar in Episodes.

⚠️ Cache note: tmdbCache entries written before session 6 by schedule
carried logoPath:null; they self-heal as the 6h TTL expires.

**Verified:** typecheck, lint, 13 vitest tests, build, convex deploys all
clean; recommendations/genres/discover/watchProviders/stats smoke-tested
via `npx convex run` with mock identity. Signed-in UI awaits user testing.

## Previous status

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
| 6 | 2026-10-05 | Complete. Feature completion pass (polish, filters, provider rail, stats, drawer redesign). Awaiting user verification, then curated merge. |
| 7 | 2026-10-07 | Complete. Seven-feature pass (trailers, rail toggle+badges, list sort/filter, in-library row, export, season posters, merged genre browse). Awaiting user verification, then curated merge. |
| 8 | 2026-10-18 | Complete. Home header rework (CW removal, one-row tabs/search header, mobile scrollable tabs) + schedule weekly view (free week nav, catch-up removed). Awaiting user verification, then curated merge. |

