# ShowList — Improvements Roadmap

> Branch: `improvements`. One branch, granular conventional commits, curated
> merge into `main` at the end (cherry-pick / rebase-drop what the user
> rejects). This file is the plan of record; `handoff.md` gets the session
> log at the end.

## Vision

Keep ShowList what it is — a minimal, utility-driven tracker — and make the
tracking side *deep* (episodes, schedule) and the discovery side *rich*
(TMDB art, AI). Inspiration: Netflix/Prime/Disney for information
architecture (progress, next-episode, hero), movy.sx for TMDB-art-first
cards with episode/air-date metadata. Everything expressed through the
existing swiss-minimal + shadcn `base-luma` system: art and typography do
the work, no new visual chrome.

## Design principles (locked)

1. Richness from **content**, not chrome: backdrops, wordmark logos, stills,
   structured metadata (S/E, air dates, progress).
2. shadcn components as-is; layout utilities only; no custom design system.
3. Every new feature must serve the core job: track what I watch, decide
   what to watch next. If it doesn't, it's parked.
4. TMDB keys stay server-side (Convex actions). User LLM keys stay
   client-side (localStorage). Neither ever crosses.

## Phases

### Phase 1 — TV shows done properly (seasons & episodes)
- `convex/tmdb.ts`: `tvSummary` (seasons list, next/last episode to air,
  status) and `tvSeason` (episodes: number, name, overview, air date,
  runtime, still). Both cached in a new `tmdbCache` table (TTL ~12–24h) —
  schedule and drawer share the cache.
- Schema: `episodeWatches` table (userId, tmdbId, season, episode,
  watchedAt) + indexes. `deleteIfFullyUnset` extended: an item with episode
  watches is never auto-deleted.
- `convex/episodeWatches.ts`: `listForShow`, `listMine`, `toggle`,
  `setSeason` (bulk mark/unmark). Marking an episode lazily creates the item
  doc and flips `watching: true` (a show you tick episodes on is a show you
  watch); `watched`/watchlist flags are left alone (rewatch case).
- UI: Details drawer gains an **Episodes** section for shows — season chips,
  episode rows with stills + air dates + watched ticks, per-season "mark all",
  per-season progress. PrimeWire-style one-tap ticks.

### Phase 2 — My Schedule
- Tab on `/` (5th tab). Computed from *all* TV items in the library,
  regardless of status — a show marked watched whose new season starts
  airing still appears (the reason the feature exists).
- Backend: `convex/schedule.ts` action — batch-fetches per-show airing data
  (via the Phase 1 cache), returns upcoming + recently-aired entries; client
  joins with items + episode watches for titles/posters/ticks.
- UI: grouped by day ("Today", "Tomorrow", weekday, date), rows = small
  poster + title + S·E + episode name + relative air time + tick state.
  Sections: Upcoming, then Recently aired (catch-up). Empty state explains
  the feature.

### Phase 3 — AI, user's key, browser-only
- `lib/ai.ts`: OpenAI-compatible chat client (works with OpenAI, OpenRouter,
  Gemini's OpenAI-compat endpoint, custom base URL). Config + key in
  localStorage only; a Settings dialog in the header manages it, with an
  explicit "stored in your browser, never sent to ShowList servers" note.
- **Describe mode**: the search bar gets a sparkle toggle — describe what
  you feel like watching; the LLM returns candidate titles + one-line
  reasons, each resolved via TMDB search into real cards you can add.
- **For you**: on Discover — recommendations reasoned from your library
  (liked/watched/watchlist), rendered as the same cards with reasons.
- No chat history, no server AI features, no bloat. Everything else gets
  parked in this file's "Parked" section.

### Phase 4 — Design pass with TMDB art
- Discover hero: top trending title as a backdrop hero with wordmark logo +
  overview + actions (swiss restraint: type over chrome).
- Unify DiscoverCard → ShowCard so discovery results carry the full action
  overlay (add to watchlist/collections straight from Discover) — currently
  they're inert posters, a real gap.
- Ranked "Top 10" row on Discover trending (movy.sx pattern).
- Schedule rows and episode lists use TMDB stills; drawer header already has
  backdrop + logo (user's WIP, keep and polish).

### Phase 5 — The sweep
- shadcn improve skill (github.com/shadcn/improve) checklist pass.
- Error/empty/loading states audit, a11y pass (labels, focus), perf pass
  (image sizes, query bounds), `pnpm typecheck` + `lint` + `build` clean.
- Update `README.md` / `handoff.md`; log every commit in the session log.

## Parked (deliberately not building)

- Rename/delete collections, public collections (already parked in brief)
- Push notifications / emails for schedule
- Watch progress within an episode (e.g. "stopped at 23:14")
- Streaming-service availability mapping (TMDB watch providers)
- Multi-user shared lists, comments
- Chat-style AI conversations (only one-shot modes above)
