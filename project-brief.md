# ShowList — Project Brief

> This is the source of truth for what ShowList is and how it behaves.
> Read this at the start of every build session, together with `build-plan.md` and `handoff.md`.

## What it is

ShowList is a minimal, utility-driven movie & TV tracker. A signed-in user can search
for movies/shows (via TMDB), and organize them into a **Watchlist**, a **Watched** list,
and their own **Collections**, with liked/disliked sentiment per item.

Design philosophy: minimal, no custom design work — use shadcn/ui components **as-is**
with the existing `components.json` config (style `base-luma`, hugeicons icon library).
No new design systems, no custom CSS beyond layout utility classes.

## Tech stack (already set up)

- Next.js 16 (App Router) — **read `node_modules/next/dist/docs/` before writing Next code; this version has breaking changes** (e.g. middleware lives in `proxy.ts`)
- Convex (backend/database) — **read `convex/_generated/ai/guidelines.md` before writing any Convex code**
- Clerk (auth) — already wired into `app/layout.tsx`; Convex⇄Clerk connection is built in Session 1
- Tailwind v4 + shadcn/ui (`base-luma` style, hugeicons), next-themes dark mode
- pnpm. **Never install anything globally; keep all changes inside this workspace.**
- TMDB API for search/details. `TMDB_API_KEY` is already set in `.env.local`. All TMDB
  calls go through Convex actions so the key stays server-side.

## Locked-in product decisions

| Decision | Choice |
|---|---|
| Watchlist vs Watched | **Independent flags.** An item can be in both at once (e.g. watched it, want to rewatch). Each button is a toggle. |
| Liked/Disliked | Mutually exclusive toggle. Clicking the active one clears it. Available on any item. |
| Signed-out users | See a **landing page at `/`** (what the site does + sign in / sign up). Nothing else is accessible. |
| Routing | Everything on `/`. Signed-out → landing; signed-in → the app. No separate `/app` route. |
| Session persistence | Clerk default persistent sessions. No "remember me" UI needed. |
| Sign-up fields | Email only (Clerk defaults). Do not collect name. |
| Data source | TMDB. Search + details via Convex actions. |
| Item cleanup | When an item has no watchlist flag, no watched flag, no sentiment, and is in no collection, delete its Convex doc. |

## UI specification

### Top nav
- Far left: **"ShowList"** wordmark (plain text, links to `/`).
- Far right: Clerk `UserButton` (signed-in). Signed-out landing shows Sign in / Sign up buttons.

### Search (signed-in, below nav)
- Centered search bar. Debounced (~400ms) TMDB multi-search (movies + TV only, ignore people).
- While a query is active: results grid replaces everything below the search bar
  (tabs + grids hidden). Clearing the query restores the tabs UI.
- Result cards are **the exact same card component** as list cards — same hover/click
  overlay, same kebab/drawer behavior. Buttons reflect the user's existing state
  (e.g. already-watchlisted item shows the watchlist button active).

### Tabs (below search)
Three tabs: **Watchlist** (default) | **Watched** | **Collections**.
- Watchlist / Watched: clicking shows that list's card grid below.
- **Collections** tab: clicking opens a dropdown —
  - Top item: **"Create collection"** → opens a modal (name input, create button).
  - Below: the user's collections. Clicking one shows that collection's card grid,
    and the tab label changes to **"Collection – {name}"**.
- Each grid has an empty state (short friendly message).

### Card
- Poster (TMDB image, `image.tmdb.org` — configured in `next.config.ts` remotePatterns).
- Below poster: title.
- Below title, one row: `Movie`/`Show` · divider · release year · far right: **horizontal
  kebab (⋯)**.
- Kebab click → opens a **Drawer** with item details fetched from TMDB (overview, genres,
  runtime/seasons, rating, etc.).

### Card overlay (the action layer)
- Desktop: hover over the poster shows a semi-transparent overlay.
- Mobile / click: tapping the poster opens the overlay and it **persists** until the user
  taps/clicks anywhere else. Only one card's overlay is open at a time.
- Overlay buttons (each shows active state — filled icon — if already set):
  1. icon + **Watchlist** (toggle)
  2. icon + **Watched** (toggle)
  3. icon + **Collections** → opens a popover listing the user's collections with
     checkboxes (add/remove this item), plus a "New collection" entry at top.
  4. Below: two side-by-side icon-only buttons: **liked** / **disliked** (mutually
     exclusive toggle).

## Data model (Convex)

```
items:            userId, tmdbId, mediaType ("movie"|"tv"), title, posterPath,
                  year, inWatchlist (bool), watched (bool),
                  sentiment ("liked"|"disliked"|undefined), updatedAt
                  indexes: by_user, by_user_media (userId, mediaType, tmdbId)

collections:      userId, name, createdAt
                  index: by_user

collectionItems:  collectionId, itemId
                  indexes: by_collection, by_item, by_collection_item
```

- `userId` = Clerk subject from `ctx.auth.getUserIdentity()`. Every query/mutation
  must check auth and scope to the caller's data.
- An `items` doc is created lazily on first action (toggle/sentiment/add-to-collection)
  and stores a small TMDB snapshot so lists render without re-fetching TMDB.
- The app loads the signed-in user's items once (they're small) to map statuses onto
  search results client-side.

## Convex functions (planned surface)

- `tmdb.ts` (actions): `search(query)`, `details(mediaType, tmdbId)`
- `items.ts`: queries `listMine` (all my items; client filters watchlist/watched);
  mutations `toggleWatchlist`, `toggleWatched`, `setSentiment` (all take the TMDB
  snapshot for lazy create; all run the cleanup rule)
- `collections.ts`: queries `listMine`, `getItems(collectionId)`; mutations `create`,
  `addItem`, `removeItem` (removeItem runs the cleanup rule)

## Ideas parked for later (do NOT build unless asked)

- Rename/delete collections (small kebab next to the active collection tab label)
- Sorting/filtering of grids; pagination for very large lists
- Public/shared collections
- Collecting user names at sign-up (Clerk dashboard toggle, no code)
