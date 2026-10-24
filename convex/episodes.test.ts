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

test.each(["toggle", "season"])(
  "%s unmark removes all duplicates and cleans the now-unset item",
  async (mode) => {
    const t = convexTest(schema, modules).withIdentity(IDENTITY)
    await t.mutation(api.episodes.toggle, {
      item: SNAPSHOT,
      season: 1,
      episode: 1,
    })
    await t.mutation(api.items.toggleWatching, { item: SNAPSHOT })
    await t.run(async (ctx) => {
      for (const watchedAt of [10, 20]) {
        await ctx.db.insert("episodeWatches", {
          userId: IDENTITY.tokenIdentifier,
          tmdbId: SNAPSHOT.tmdbId,
          season: 1,
          episode: 1,
          watchedAt,
        })
      }
    })
    if (mode === "toggle") {
      await t.mutation(api.episodes.toggle, {
        item: SNAPSHOT,
        season: 1,
        episode: 1,
      })
    } else {
      await t.mutation(api.episodes.setSeason, {
        item: SNAPSHOT,
        season: 1,
        episodes: [1, 1],
        watched: false,
      })
    }
    expect(await t.query(api.episodes.listMine, {})).toEqual([])
    expect(await t.query(api.items.listMine, {})).toEqual([])
  }
)

test("mark season deduplicates input and existing rows, keeping the oldest watched date locally", async () => {
  const t = convexTest(schema, modules).withIdentity(IDENTITY)
  await t.run(async (ctx) => {
    for (const season of [1, 2]) {
      for (const watchedAt of [300, 100, 200]) {
        await ctx.db.insert("episodeWatches", {
          userId: IDENTITY.tokenIdentifier,
          tmdbId: SNAPSHOT.tmdbId,
          season,
          episode: 1,
          watchedAt,
        })
      }
    }
  })
  const args = {
    item: SNAPSHOT,
    season: 1,
    episodes: [2, 2, 3, 3],
    watched: true,
  }
  await t.mutation(api.episodes.setSeason, args)
  const before = await t.query(api.episodes.listMine, {})
  expect(before.filter((row) => row.season === 1)).toHaveLength(3)
  expect(
    before.find((row) => row.season === 1 && row.episode === 1)?.watchedAt
  ).toBe(100)
  expect(before.filter((row) => row.season === 2)).toHaveLength(3)
  await t.mutation(api.episodes.setSeason, args)
  expect(await t.query(api.episodes.listMine, {})).toEqual(before)
})

test.each([true, false])(
  "empty season selection is a no-op (watched=%s)",
  async (watched) => {
    const t = convexTest(schema, modules).withIdentity(IDENTITY)
    await t.mutation(api.episodes.setSeason, {
      item: SNAPSHOT,
      season: 0,
      episodes: [],
      watched,
    })
    expect(await t.query(api.items.listMine, {})).toEqual([])
    await t.mutation(api.items.toggleWatchlist, { item: SNAPSHOT })
    const before = await t.query(api.items.listMine, {})
    await t.mutation(api.episodes.setSeason, {
      item: SNAPSHOT,
      season: 0,
      episodes: [],
      watched,
    })
    expect(await t.query(api.items.listMine, {})).toEqual(before)
  }
)

test.each([
  "progress",
  "watchlist",
  "watched",
  "watching",
  "sentiment",
  "collection",
])("clearing a season preserves items retained by %s", async (reason) => {
  const t = convexTest(schema, modules).withIdentity(IDENTITY)
  await t.mutation(api.episodes.setSeason, {
    item: SNAPSHOT,
    season: 1,
    episodes: [1, 2],
    watched: true,
  })
  if (reason !== "watching")
    await t.mutation(api.items.toggleWatching, { item: SNAPSHOT })
  if (reason === "progress")
    await t.mutation(api.episodes.toggle, {
      item: SNAPSHOT,
      season: 0,
      episode: 1,
    })
  if (reason === "progress")
    await t.mutation(api.items.toggleWatching, { item: SNAPSHOT })
  if (reason === "watchlist")
    await t.mutation(api.items.toggleWatchlist, { item: SNAPSHOT })
  if (reason === "watched")
    await t.mutation(api.items.toggleWatched, { item: SNAPSHOT })
  if (reason === "sentiment")
    await t.mutation(api.items.setSentiment, {
      item: SNAPSHOT,
      sentiment: "liked",
    })
  if (reason === "collection") {
    const collectionId = await t.mutation(api.collections.create, {
      name: "Keep",
    })
    await t.mutation(api.collections.addItem, { collectionId, item: SNAPSHOT })
  }
  const before = await t.query(api.items.listMine, {})
  await t.mutation(api.episodes.setSeason, {
    item: SNAPSHOT,
    season: 1,
    episodes: [1, 2],
    watched: false,
  })
  expect(await t.query(api.items.listMine, {})).toEqual(before)
  expect(
    await t.query(api.episodes.listForShow, { tmdbId: SNAPSHOT.tmdbId })
  ).toHaveLength(reason === "progress" ? 1 : 0)
})

test("TV episode ticks cannot retain a movie with the same numeric ID", async () => {
  const t = convexTest(schema, modules).withIdentity(IDENTITY)
  await t.mutation(api.episodes.toggle, {
    item: SNAPSHOT,
    season: 0,
    episode: 1,
  })
  const item = { ...SNAPSHOT, mediaType: "movie" as const }
  await t.mutation(api.items.toggleWatchlist, { item })
  await t.mutation(api.items.toggleWatchlist, { item })
  const items = await t.query(api.items.listMine, {})
  expect(items).toHaveLength(1)
  expect(items[0].mediaType).toBe("tv")
  expect(await t.query(api.episodes.listMine, {})).toHaveLength(1)
})

test("all episode endpoints require authentication, including empty selections", async () => {
  const t = convexTest(schema, modules)
  await expect(t.query(api.episodes.listMine, {})).rejects.toThrow(
    "Not signed in"
  )
  await expect(
    t.query(api.episodes.listForShow, { tmdbId: SNAPSHOT.tmdbId })
  ).rejects.toThrow("Not signed in")
  await expect(
    t.mutation(api.episodes.toggle, { item: SNAPSHOT, season: 1, episode: 1 })
  ).rejects.toThrow("Not signed in")
  await expect(
    t.mutation(api.episodes.setSeason, {
      item: SNAPSHOT,
      season: 1,
      episodes: [],
      watched: true,
    })
  ).rejects.toThrow("Not signed in")
})

test("progress and cleanup are isolated by token identifier, not subject", async () => {
  const t = convexTest(schema, modules)
  const alice = t.withIdentity(IDENTITY)
  const bob = t.withIdentity({
    ...IDENTITY,
    issuer: "https://other.example.com",
    tokenIdentifier: "https://other.example.com|test-user",
  })
  for (const user of [alice, bob]) {
    await user.mutation(api.episodes.setSeason, {
      item: SNAPSHOT,
      season: 1,
      episodes: [1, 2],
      watched: true,
    })
    await user.mutation(api.items.toggleWatching, { item: SNAPSHOT })
  }
  const bobItems = await bob.query(api.items.listMine, {})
  const bobWatches = await bob.query(api.episodes.listMine, {})
  await alice.mutation(api.episodes.toggle, {
    item: SNAPSHOT,
    season: 1,
    episode: 1,
  })
  await alice.mutation(api.episodes.setSeason, {
    item: SNAPSHOT,
    season: 1,
    episodes: [2],
    watched: false,
  })
  expect(await alice.query(api.episodes.listMine, {})).toEqual([])
  expect(await alice.query(api.items.listMine, {})).toEqual([])
  expect(await bob.query(api.episodes.listMine, {})).toEqual(bobWatches)
  expect(await bob.query(api.items.listMine, {})).toEqual(bobItems)
  expect(
    await bob.query(api.episodes.listForShow, { tmdbId: SNAPSHOT.tmdbId })
  ).toHaveLength(2)
})

const invalidNumbers = [
  0,
  -1,
  1.5,
  NaN,
  Infinity,
  -Infinity,
  Number.MAX_SAFE_INTEGER + 1,
]

test.each(invalidNumbers)(
  "rejects invalid snapshot ID %s at the shared boundary",
  async (tmdbId) => {
    const t = convexTest(schema, modules).withIdentity(IDENTITY)
    const item = { ...SNAPSHOT, tmdbId }
    for (const mutation of [
      api.items.toggleWatchlist,
      api.items.toggleWatched,
      api.items.toggleWatching,
    ]) {
      await expect(t.mutation(mutation, { item })).rejects.toThrow("TMDB ID")
    }
    await expect(
      t.mutation(api.items.setSentiment, { item, sentiment: "liked" })
    ).rejects.toThrow("TMDB ID")
    const collectionId = await t.mutation(api.collections.create, {
      name: "Test",
    })
    await expect(
      t.mutation(api.collections.addItem, { item, collectionId })
    ).rejects.toThrow("TMDB ID")
    await expect(
      t.mutation(api.episodes.toggle, { item, season: 1, episode: 1 })
    ).rejects.toThrow("TMDB ID")
    for (const watched of [true, false]) {
      await expect(
        t.mutation(api.episodes.setSeason, {
          item,
          season: 1,
          episodes: [],
          watched,
        })
      ).rejects.toThrow("TMDB ID")
    }
    expect(await t.query(api.items.listMine, {})).toEqual([])
    expect(await t.query(api.episodes.listMine, {})).toEqual([])
  }
)

test.each(invalidNumbers)(
  "validates safe season and episode numbers (%s) before all writes",
  async (value) => {
    const t = convexTest(schema, modules).withIdentity(IDENTITY)
    await expect(
      t.mutation(api.episodes.toggle, {
        item: SNAPSHOT,
        season: 1,
        episode: value,
      })
    ).rejects.toThrow("Episode number")
    if (value !== 0)
      await expect(
        t.mutation(api.episodes.toggle, {
          item: SNAPSHOT,
          season: value,
          episode: 1,
        })
      ).rejects.toThrow("Season number")
    for (const watched of [true, false]) {
      await expect(
        t.mutation(api.episodes.setSeason, {
          item: SNAPSHOT,
          season: 1,
          episodes: [1, value],
          watched,
        })
      ).rejects.toThrow("Episode number")
      if (value !== 0)
        await expect(
          t.mutation(api.episodes.setSeason, {
            item: SNAPSHOT,
            season: value,
            episodes: [],
            watched,
          })
        ).rejects.toThrow("Season number")
    }
    expect(await t.query(api.items.listMine, {})).toEqual([])
    expect(await t.query(api.episodes.listMine, {})).toEqual([])
  }
)

test("episode mutations reject movie snapshots on mark and clear", async () => {
  const t = convexTest(schema, modules).withIdentity(IDENTITY)
  const item = { ...SNAPSHOT, mediaType: "movie" as const }
  await expect(
    t.mutation(api.episodes.toggle, { item, season: 1, episode: 1 })
  ).rejects.toThrow("TV item")
  for (const watched of [true, false]) {
    await expect(
      t.mutation(api.episodes.setSeason, {
        item,
        season: 1,
        episodes: [1],
        watched,
      })
    ).rejects.toThrow("TV item")
  }
  expect(await t.query(api.items.listMine, {})).toEqual([])
  expect(await t.query(api.episodes.listMine, {})).toEqual([])
})

test("season input and legacy row repairs stay within the existing 2000-row bound", async () => {
  const t = convexTest(schema, modules).withIdentity(IDENTITY)
  await expect(
    t.mutation(api.episodes.setSeason, {
      item: SNAPSHOT,
      season: 1,
      episodes: Array<number>(2001).fill(1),
      watched: true,
    })
  ).rejects.toThrow("Too many episodes")
  await t.run(async (ctx) => {
    for (let i = 0; i < 2001; i++) {
      await ctx.db.insert("episodeWatches", {
        userId: IDENTITY.tokenIdentifier,
        tmdbId: SNAPSHOT.tmdbId,
        season: 1,
        episode: 1,
        watchedAt: i,
      })
    }
  })
  for (const watched of [true, false]) {
    await expect(
      t.mutation(api.episodes.setSeason, {
        item: SNAPSHOT,
        season: 1,
        episodes: [1],
        watched,
      })
    ).rejects.toThrow("Too many existing episode rows")
  }
  await expect(
    t.mutation(api.episodes.toggle, { item: SNAPSHOT, season: 1, episode: 1 })
  ).rejects.toThrow("Too many existing episode rows")
  expect(await t.query(api.episodes.listMine, {})).toHaveLength(2001)
  expect(await t.query(api.items.listMine, {})).toEqual([])
})
