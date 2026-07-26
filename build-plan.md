# ShowList — Build Plan

Three sessions. Each session: read `project-brief.md` + this file + `handoff.md` first,
build only its own scope, verify, then update `handoff.md` before finishing.

Rules for every session:

- Read `convex/_generated/ai/guidelines.md` before writing Convex code.
- Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code.
- Use shadcn/ui components as-is: add them with `pnpm dlx shadcn@latest add <component>`
  (project-local, never global installs).
- Run `pnpm typecheck` and `pnpm lint` before calling a session done, and verify the
  session's checklist in the running app (`pnpm dev` + `npx convex dev`).
- Do not build ahead into a later session's scope.

---

## Session 1 — Foundation (backend wiring + search + base card)

**Goal:** signed-out landing page; signed-in users can search TMDB and see result cards.

1. **Convex ⇄ Clerk wiring**
   - Create `convex/auth.config.ts` using the Clerk issuer domain.
     ⚠️ Requires a one-time user step: create a "convex" JWT template in the Clerk
     dashboard and note the issuer URL. Pause and ask the user to do this when reached.
   - Client providers: `ConvexProviderWithClerk` + `ConvexReactClient` in a
     `components/convex-client-provider.tsx` ("use client"), nested inside the
     existing `ClerkProvider` in `app/layout.tsx`.
   - Verify `npx convex dev` runs clean and auth reaches Convex
     (`ctx.auth.getUserIdentity()` non-null in a test query, then remove the test).
2. **Schema** — `convex/schema.ts` exactly as specified in the brief (items,
   collections, collectionItems + indexes).
3. **TMDB actions** — `convex/tmdb.ts`: `search` (multi-search, filter to
   movie/tv, map to `{tmdbId, mediaType, title, posterPath, year}`) and
   `details(mediaType, tmdbId)`. Key from `process.env.TMDB_API_KEY`
   (set it in the Convex deployment env with `npx convex env set` — ask user or run it).
4. **Layout & landing**
   - Rework `app/layout.tsx` header: "ShowList" wordmark far left, Clerk controls far right.
   - `app/page.tsx`: signed-out → simple landing (one-liner about the app + sign in/up);
     signed-in → the app shell (search bar + placeholder for tabs area).
   - Configure `image.tmdb.org` in `next.config.ts` images.remotePatterns.
5. **Search UI** — centered search input (shadcn `input`), ~400ms debounce, calls the
   search action, renders results grid. Non-empty query hides the tabs area placeholder.
6. **Base card component** — `components/show-card.tsx`: poster, title,
   Movie/Show · year row, kebab button (inert for now — no drawer yet, no overlay yet).
   Used by the search grid. Responsive grid (2-col mobile → 5–6 col desktop).

**Done when:** signed-out sees landing; signed-in can search "batman" and see a
responsive grid of correct cards; typecheck/lint pass.

---

## Session 2 — Core actions (overlay + tabs + drawer)

**Goal:** watchlist/watched/sentiment fully working from both search and tabs; details drawer.

1. **Items backend** — `convex/items.ts`: `listMine` query; `toggleWatchlist`,
   `toggleWatched`, `setSentiment` mutations (lazy-create with TMDB snapshot args,
   auth-scoped, cleanup rule: delete doc when fully unset and not in any collection).
2. **Card overlay** — extend `show-card.tsx`:
   - Hover overlay on desktop; click/tap opens it persistently; closes on outside
     click/Escape; only one open at a time (lift "active card id" state to the grid).
   - Buttons: Watchlist, Watched (toggles with active/filled state), Collections
     (placeholder button, disabled until Session 3), liked/disliked icon pair
     (mutually exclusive toggle).
   - Wire buttons to mutations; state comes from `listMine` mapped by
     `mediaType:tmdbId` so search results show correct state too.
3. **Tabs** — shadcn `tabs`: Watchlist (default) | Watched | Collections (tab present
   but its dropdown is Session 3 — for now clicking it shows a "coming next" empty pane).
   Watchlist/Watched panes render card grids filtered from `listMine`, with empty states.
   Tabs hidden while a search query is active.
4. **Details drawer** — kebab opens shadcn `drawer` with details from the
   `tmdb.details` action (loading state, overview, genres, runtime/seasons, rating).

**Done when:** toggling from a search card instantly appears in the right tab;
both flags can coexist on one item; unsetting everything removes the item;
drawer shows details; mobile tap-overlay behaves; typecheck/lint pass.

---

## Session 3 — Collections + polish

**Goal:** full collections feature; app feels finished.

1. **Collections backend** — `convex/collections.ts`: `listMine`, `getItems`,
   `create`, `addItem`, `removeItem` (auth-scoped; removeItem runs cleanup rule;
   addItem lazy-creates the item doc like the toggles do).
2. **Collections tab dropdown** — clicking the Collections tab opens a `dropdown-menu`:
   "Create collection" on top (opens a `dialog` with name input), then the user's
   collections. Selecting one renders that collection's grid and relabels the tab
   "Collection – {name}". Re-clicking the tab reopens the dropdown to switch.
3. **Overlay Collections popover** — enable the Collections button on the card overlay:
   `popover` with checkbox list of collections (checked = item in it) toggling
   add/remove, plus "New collection" entry on top opening the same create dialog.
4. **Polish pass**
   - Empty states for all grids; loading skeletons for search and grids.
   - Mobile pass: overlay tap behavior, drawer, dropdowns, grid columns.
   - Landing page copy check; dark mode sanity check.
   - Remove any leftover placeholders/dead code from earlier sessions.
5. **Final QA** — walk the full checklist in `project-brief.md` UI spec top to bottom
   in the browser; `pnpm typecheck`, `pnpm lint`, `pnpm build`.

**Done when:** every behavior in the brief's UI spec works end to end; build passes.
Mark the project complete in `handoff.md`.
