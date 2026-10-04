import { convexTest } from "convex-test"
import { expect, test } from "vitest"

import { api } from "./_generated/api"
import schema from "./schema"

// vite ships only as a transitive dep under pnpm, so the usual
// /// <reference types="vite/client" /> for import.meta.glob can't resolve —
// cast the one glob call instead.
const modules = (
  import.meta as unknown as {
    glob: (pattern: string) => Record<string, () => Promise<unknown>>
  }
).glob("./**/*.ts")

const SNAPSHOT = {
  tmdbId: 1396,
  mediaType: "tv" as const,
  title: "Breaking Bad",
  posterPath: "/ggFHVNu6YYI5L9pCfOacjizRGt.jpg",
  year: "2008",
}

const IDENTITY = {
  tokenIdentifier: "https://qa.example.com|test-user",
  issuer: "https://qa.example.com",
  subject: "test-user",
}

test("toggle marks an episode, lazily creates the item, flips watching on", async () => {
  const t = convexTest(schema, modules).withIdentity(IDENTITY)
  await t.mutation(api.episodes.toggle, {
    item: SNAPSHOT,
    season: 1,
    episode: 1,
  })

  const watches = await t.query(api.episodes.listForShow, { tmdbId: 1396 })
  expect(watches).toHaveLength(1)
  expect(watches[0]).toMatchObject({ season: 1, episode: 1 })

  const items = await t.query(api.items.listMine, {})
  expect(items).toHaveLength(1)
  expect(items[0]).toMatchObject({
    tmdbId: 1396,
    watching: true,
    inWatchlist: false,
    watched: false,
  })
})

test("toggle twice un-marks the episode; other flags stay untouched", async () => {
  const t = convexTest(schema, modules).withIdentity(IDENTITY)
  await t.mutation(api.episodes.toggle, {
    item: SNAPSHOT,
    season: 1,
    episode: 1,
  })
  await t.mutation(api.items.toggleWatchlist, { item: SNAPSHOT })

  await t.mutation(api.episodes.toggle, {
    item: SNAPSHOT,
    season: 1,
    episode: 1,
  })

  const watches = await t.query(api.episodes.listForShow, { tmdbId: 1396 })
  expect(watches).toHaveLength(0)

  // The watchlist flag survives the un-tick; the item is not deleted.
  const items = await t.query(api.items.listMine, {})
  expect(items).toHaveLength(1)
  expect(items[0]).toMatchObject({ inWatchlist: true })
})

test("setSeason marks a whole season, then clears it", async () => {
  const t = convexTest(schema, modules).withIdentity(IDENTITY)
  await t.mutation(api.episodes.setSeason, {
    item: SNAPSHOT,
    season: 2,
    episodes: [1, 2, 3],
    watched: true,
  })

  let watches = await t.query(api.episodes.listForShow, { tmdbId: 1396 })
  expect(watches.map((w) => w.episode).sort()).toEqual([1, 2, 3])

  await t.mutation(api.episodes.setSeason, {
    item: SNAPSHOT,
    season: 2,
    episodes: [1, 2, 3],
    watched: false,
  })
  watches = await t.query(api.episodes.listForShow, { tmdbId: 1396 })
  expect(watches).toHaveLength(0)
})

test("an item with episode progress survives the full cleanup path", async () => {
  const t = convexTest(schema, modules).withIdentity(IDENTITY)
  await t.mutation(api.episodes.toggle, {
    item: SNAPSHOT,
    season: 1,
    episode: 1,
  })
  // Flip every other flag on and off; the episode tick must keep the doc.
  await t.mutation(api.items.toggleWatchlist, { item: SNAPSHOT })
  await t.mutation(api.items.toggleWatchlist, { item: SNAPSHOT })

  let items = await t.query(api.items.listMine, {})
  expect(items).toHaveLength(1)

  // Un-mark the episode, then turn watching off — now nothing holds the
  // doc and the cleanup rule deletes it.
  await t.mutation(api.episodes.toggle, {
    item: SNAPSHOT,
    season: 1,
    episode: 1,
  })
  await t.mutation(api.items.toggleWatching, { item: SNAPSHOT })
  items = await t.query(api.items.listMine, {})
  expect(items).toHaveLength(0)
})

test("listMine returns the projected shape across shows", async () => {
  const t = convexTest(schema, modules).withIdentity(IDENTITY)
  await t.mutation(api.episodes.toggle, {
    item: SNAPSHOT,
    season: 1,
    episode: 1,
  })
  await t.mutation(api.episodes.toggle, {
    item: { ...SNAPSHOT, tmdbId: 66732, title: "Stranger Things" },
    season: 4,
    episode: 9,
  })

  const all = await t.query(api.episodes.listMine, {})
  expect(all).toHaveLength(2)
  expect(all.map((row) => row.tmdbId).sort()).toEqual([1396, 66732])
  // Projected shape only — no doc fields.
  expect(Object.keys(all[0]).sort()).toEqual([
    "episode",
    "season",
    "tmdbId",
    "watchedAt",
  ])
})
