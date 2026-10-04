# ShowList

A minimal, utility-driven movie & TV tracker. Search TMDB, keep a
watchlist / watching / watched lists, organize titles into collections,
tick individual episodes, and see when the next episode of anything you
track is airing. Optional AI picks run on **your own** API key, entirely in
your browser.

## Features

- **Track** — Watchlist, Watching, Watched tabs plus per-title sentiment
  (liked/disliked) and your own Collections.
- **Episodes** — every show's drawer lists seasons and episodes with stills,
  air dates and one-tap watched ticks (per-season "mark all" too).
- **Schedule** — upcoming and recently-aired episodes for *everything* in
  your library, regardless of status: a show marked watched whose new
  season starts airing shows up again automatically.
- **Discover** — trending hero, Top 10 this week, popular/top-rated/in
  theaters rows; every result carries the full tracking overlay.
- **AI (bring your own key)** — describe what you feel like watching, and
  get "for you" picks reasoned from your library. The key lives in your
  browser's localStorage and is sent only to the provider you choose —
  never to ShowList's backend. OpenAI, OpenRouter, Google Gemini and any
  OpenAI-compatible endpoint are supported.

## Stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript
- [Convex](https://convex.dev) backend (items, collections, episode
  tracking, TMDB cache)
- [Clerk](https://clerk.com) auth
- [TMDB](https://themoviedb.org) for all movie/TV data
- Tailwind CSS v4 + shadcn/ui (`base-luma` style, hugeicons icons)

## Development

```bash
pnpm install
pnpm dev          # Next.js on :3000 (or :3001 if 3000 is taken)
npx convex dev    # Convex function sync (separate terminal)
```

Secrets live in `.env.local` (see `.env.example`): Convex deployment, Clerk
keys, and `TMDB_API_KEY` — the TMDB key is set on the Convex deployment via
`npx convex env set TMDB_API_KEY <key>` so all TMDB calls stay server-side.

Useful scripts:

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm format
```

## Project docs

- `project-brief.md` — source of truth for what ShowList is
- `build-plan.md` / `handoff.md` — session-based build history
- `ROADMAP.md` — the improvements branch plan (phases, principles, parked ideas)
- `plans/README.md` — advisor-style improvement plans not yet implemented

## Adding UI components

shadcn/ui components are used as-is:

```bash
pnpm dlx shadcn@latest add <component>
```
