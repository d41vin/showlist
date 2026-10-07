"use client"

import { Download01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useAction, useConvexAuth, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { useEffect, useMemo, useState } from "react"

import { Show, SignInButton, SignUpButton } from "@clerk/nextjs"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"

type ItemDoc = Doc<"items">
type WatchTime = FunctionReturnType<typeof api.stats.get>

// Export helpers — everything is generated in the browser from the reactive
// queries; nothing passes through a server.
function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

function csvField(value: string | number | boolean) {
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

function isoOrNull(ms: number | undefined) {
  return ms === undefined ? "" : new Date(ms).toISOString()
}

// The Stats page: counts come reactively from the user's own data (free),
// estimated watch time comes from TMDB runtimes via the shared cache.
export default function StatsPage() {
  return (
    <>
      <Show when="signed-out">
        <main className="flex min-h-[calc(100svh-3.5rem)] items-center justify-center px-6">
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <h1 className="text-4xl font-semibold tracking-tight">ShowList</h1>
            <p className="text-muted-foreground">
              Sign in to see your tracking stats.
            </p>
            <div className="flex items-center gap-2">
              <SignUpButton>
                <Button>Get started</Button>
              </SignUpButton>
              <SignInButton>
                <Button variant="outline">Sign in</Button>
              </SignInButton>
            </div>
          </div>
        </main>
      </Show>
      <Show when="signed-in">
        <StatsContent />
      </Show>
    </>
  )
}

function StatsContent() {
  const { isAuthenticated } = useConvexAuth()
  const myItems = useQuery(api.items.listMine, isAuthenticated ? {} : "skip")
  const watches = useQuery(api.episodes.listMine, isAuthenticated ? {} : "skip")
  const myCollections = useQuery(
    api.collections.listMine,
    isAuthenticated ? {} : "skip"
  )
  const memberships = useQuery(
    api.collections.listMemberships,
    isAuthenticated ? {} : "skip"
  )
  const statsGet = useAction(api.stats.get)

  const [watchTime, setWatchTime] = useState<WatchTime | null>(null)
  const [failed, setFailed] = useState(false)

  const watchedMovies = useMemo(
    () =>
      (myItems ?? [])
        .filter((item) => item.mediaType === "movie" && item.watched)
        .map((item) => item.tmdbId),
    [myItems]
  )
  const tickedSeasons = useMemo(
    () =>
      [
        ...new Set(
          (watches ?? []).map((watch) => `${watch.tmdbId}:${watch.season}`)
        ),
      ].map((key) => {
        const [tmdbId, season] = key.split(":").map(Number)
        return { tmdbId, season }
      }),
    [watches]
  )
  // Only refetch when the underlying inputs actually change (string keys,
  // not array identities).
  const moviesKey = useMemo(() => watchedMovies.join(","), [watchedMovies])
  const seasonsKey = useMemo(
    () => tickedSeasons.map((s) => `${s.tmdbId}:${s.season}`).join(","),
    [tickedSeasons]
  )

  useEffect(() => {
    if (!isAuthenticated || myItems === undefined || watches === undefined) {
      return
    }
    if (moviesKey === "" && seasonsKey === "") {
      return
    }
    let cancelled = false
    statsGet({
      movieIds: moviesKey === "" ? [] : moviesKey.split(",").map(Number),
      tvSeasons:
        seasonsKey === ""
          ? []
          : seasonsKey.split(",").map((key) => {
              const [tmdbId, season] = key.split(":").map(Number)
              return { tmdbId, season }
            }),
    })
      .then((result) => {
        if (!cancelled) {
          setWatchTime(result)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, myItems, watches, moviesKey, seasonsKey, statsGet])

  const stats = useMemo(() => {
    const items: ItemDoc[] = myItems ?? []
    const counts = {
      titles: items.length,
      movies: items.filter((i) => i.mediaType === "movie").length,
      shows: items.filter((i) => i.mediaType === "tv").length,
      watchlist: items.filter((i) => i.inWatchlist).length,
      watching: items.filter((i) => i.watching === true).length,
      watched: items.filter((i) => i.watched).length,
      liked: items.filter((i) => i.sentiment === "liked").length,
      disliked: items.filter((i) => i.sentiment === "disliked").length,
      episodes: (watches ?? []).length,
    }
    return counts
  }, [myItems, watches])

  const loading = myItems === undefined || watches === undefined

  const exportJson = () => {
    if (
      myItems === undefined ||
      watches === undefined ||
      myCollections === undefined ||
      memberships === undefined
    ) {
      return
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      items: myItems,
      collections: (myCollections ?? []).map(({ _id, name }) => ({
        id: _id,
        name,
      })),
      memberships: memberships ?? [],
      episodeWatches: watches,
    }
    downloadFile(
      `showlist-export-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
      "application/json"
    )
  }

  const exportItemsCsv = () => {
    if (myItems === undefined) {
      return
    }
    const collectionNames = new Map<Id<"collections">, string>()
    for (const c of myCollections ?? []) {
      collectionNames.set(c._id, c.name)
    }
    const namesByItem = new Map<Id<"items">, string[]>()
    for (const m of memberships ?? []) {
      const name = collectionNames.get(m.collectionId)
      if (name === undefined) continue
      const list = namesByItem.get(m.itemId) ?? []
      list.push(name)
      namesByItem.set(m.itemId, list)
    }
    const header = [
      "tmdbId",
      "mediaType",
      "title",
      "year",
      "posterPath",
      "inWatchlist",
      "watching",
      "watched",
      "sentiment",
      "collections",
      "watchlistAt",
      "watchedAt",
      "watchingAt",
      "updatedAt",
    ]
    const lines = [header.join(",")]
    for (const item of myItems) {
      lines.push(
        [
          item.tmdbId,
          item.mediaType,
          item.title,
          item.year ?? "",
          item.posterPath ?? "",
          item.inWatchlist,
          item.watching === true,
          item.watched,
          item.sentiment ?? "",
          (namesByItem.get(item._id) ?? []).join("; "),
          isoOrNull(item.watchlistAt),
          isoOrNull(item.watchedAt),
          isoOrNull(item.watchingAt),
          isoOrNull(item.updatedAt),
        ]
          .map(csvField)
          .join(",")
      )
    }
    downloadFile(
      `showlist-items-${new Date().toISOString().slice(0, 10)}.csv`,
      // BOM so Excel reads the UTF-8 titles correctly.
      `\uFEFF${lines.join("\r\n")}`,
      "text/csv;charset=utf-8"
    )
  }

  const exportReady =
    myItems !== undefined &&
    watches !== undefined &&
    myCollections !== undefined &&
    memberships !== undefined

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Stats</h1>

      {loading ? (
        <div className="mt-8 grid gap-8">
          <StatSectionSkeleton rows={2} />
          <StatSectionSkeleton rows={2} />
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-10">
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground">
              Library
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-6 sm:grid-cols-4">
              <Stat number={stats.titles} label="Titles tracked" big />
              <Stat number={stats.movies} label="Movies" />
              <Stat number={stats.shows} label="Shows" />
              <Stat number={stats.episodes} label="Episodes ticked" />
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-muted-foreground">
              Status
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-6 sm:grid-cols-4">
              <Stat number={stats.watchlist} label="Watchlist" />
              <Stat number={stats.watching} label="Watching" />
              <Stat number={stats.watched} label="Watched" />
              <Stat
                number={stats.liked - stats.disliked}
                label="Net sentiment"
                hint={`${stats.liked} liked · ${stats.disliked} disliked`}
              />
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-muted-foreground">
              Watch time (estimated)
            </h2>
            {failed ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Couldn&rsquo;t load runtime data right now.
              </p>
            ) : watchTime === null ? (
              <div className="mt-3 grid grid-cols-2 gap-6 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Skeleton className="h-10 w-32" />
                  <Skeleton className="h-4 w-40" />
                </div>
                <div className="flex flex-col gap-1">
                  <Skeleton className="h-10 w-32" />
                  <Skeleton className="h-4 w-40" />
                </div>
              </div>
            ) : (
              (() => {
                const totalMinutes =
                  watchTime.movieMinutes + watchTime.episodeMinutes
                const days = Math.floor(totalMinutes / (60 * 24))
                const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
                return (
                  <div className="mt-3 grid grid-cols-2 gap-6">
                    <Stat
                      number={
                        days > 0
                          ? `${days}d ${hours}h`
                          : `${Math.round(totalMinutes / 60)}h`
                      }
                      label="Total watch time"
                      big
                      hint={
                        watchTime.episodesWithRuntime > 0
                          ? `≈ ${Math.round(watchTime.episodeMinutes / 60)}h of episodes · ${Math.round(watchTime.movieMinutes / 60)}h of movies`
                          : `${Math.round(watchTime.movieMinutes / 60)}h of movies`
                      }
                    />
                    <Stat
                      number={watchTime.episodesWithRuntime}
                      label="Episodes with known runtime"
                    />
                  </div>
                )
              })()
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-muted-foreground">
              Export
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" onClick={exportJson} disabled={!exportReady}>
                <HugeiconsIcon icon={Download01Icon} />
                Download JSON
              </Button>
              <Button variant="outline" onClick={exportItemsCsv} disabled={!exportReady}>
                <HugeiconsIcon icon={Download01Icon} />
                Download items CSV
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              JSON has every item, collection and episode tick; the CSV covers
              items only. Generated in your browser.
            </p>
          </section>

          <p className="text-xs text-muted-foreground">
            Estimates use TMDB runtimes for movies you marked watched and
            episodes you ticked. Ticks are personal accounting — they
            don&rsquo;t change any list statuses.
          </p>
        </div>
      )}
    </main>
  )
}

function Stat({
  number,
  label,
  hint,
  big = false,
}: {
  number: number | string
  label: string
  hint?: string
  big?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p
        className={`font-semibold tracking-tight tabular-nums ${
          big ? "text-4xl" : "text-3xl"
        }`}
      >
        {number}
      </p>
      <p className="text-sm text-muted-foreground">{label}</p>
      {hint !== undefined && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

function StatSectionSkeleton({ rows }: { rows: number }) {
  return (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
      {Array.from({ length: rows * 2 }, (_, i) => (
        <div key={i} className="flex flex-col gap-1">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  )
}
