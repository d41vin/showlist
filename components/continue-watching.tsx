"use client"

import { useAction } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import Image from "next/image"
import { useEffect, useMemo, useState } from "react"

import { DetailsDrawer } from "@/components/details-drawer"
import { api } from "@/convex/_generated/api"
import {
  localTodayISO,
  tmdbPosterUrl,
  type CollectionSummary,
  type ItemState,
  type MediaItem,
} from "@/lib/media"

type ScheduleEntry = FunctionReturnType<
  typeof api.schedule.get
>["entries"][number]

// "Continue watching" row on home: shows marked Watching (ticking episodes
// sets this automatically) with their next episode from the schedule
// computation — the shared cache makes the extra call cheap. Quiets away
// entirely when there's nothing in progress.
export function ContinueWatching({
  isAuthenticated,
  myItems,
  stateByKey,
  collections,
}: {
  isAuthenticated: boolean
  // Full item docs — the watching flag drives the row.
  myItems: (MediaItem & { watching?: boolean })[] | undefined
  stateByKey: Map<string, ItemState>
  collections: CollectionSummary[]
}) {
  const scheduleGet = useAction(api.schedule.get)

  const watchingShows = useMemo(
    () =>
      (myItems ?? []).filter(
        (item) => item.mediaType === "tv" && item.watching === true
      ),
    [myItems]
  )
  const tmdbIdsKey = useMemo(
    () => watchingShows.map((item) => item.tmdbId).join(","),
    [watchingShows]
  )

  const [entries, setEntries] = useState<ScheduleEntry[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const tmdbIds = tmdbIdsKey === "" ? [] : tmdbIdsKey.split(",").map(Number)
    if (!isAuthenticated || tmdbIds.length === 0) {
      return
    }
    let cancelled = false
    scheduleGet({ tmdbIds, today: localTodayISO() })
      .then((result) => {
        if (!cancelled) {
          setEntries(result.entries)
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
  }, [isAuthenticated, tmdbIdsKey, scheduleGet])

  const itemsByTmdbId = useMemo(() => {
    const map = new Map<number, MediaItem>()
    for (const item of watchingShows) {
      if (!map.has(item.tmdbId)) {
        map.set(item.tmdbId, item)
      }
    }
    return map
  }, [watchingShows])

  // One tile per show: the next upcoming episode if there is one, else the
  // most recently aired one. Soonest air date first.
  const tiles = useMemo(() => {
    const out: {
      item: MediaItem
      caption: string
      sortMs: number
    }[] = []
    for (const entry of entries ?? []) {
      const item = itemsByTmdbId.get(entry.tmdbId)
      if (item === undefined) continue
      const next = entry.upcoming[0]
      if (next !== undefined) {
        out.push({
          item,
          caption: `Next S${next.season} · E${next.episode}${
            next.airDate ? ` · ${formatShortDate(next.airDate)}` : ""
          }`,
          sortMs: Date.parse(`${next.airDate}T00:00:00Z`) || Infinity,
        })
        continue
      }
      const last = entry.lastEpisode
      if (last !== null) {
        out.push({
          item,
          caption: `S${last.season} · E${last.episode}${
            last.airDate ? ` · aired ${formatShortDate(last.airDate)}` : ""
          }`,
          sortMs: Date.parse(`${last.airDate}T00:00:00Z`) || 0,
        })
      }
    }
    out.sort((a, b) => a.sortMs - b.sortMs)
    return out
  }, [entries, itemsByTmdbId])

  if (
    failed ||
    myItems === undefined ||
    (entries === null && watchingShows.length > 0) ||
    tiles.length === 0
  ) {
    return null
  }

  return (
    <section className="mb-8 flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-muted-foreground">
        Continue watching
      </h2>
      <div className="hide-scrollbar flex gap-4 overflow-x-auto pb-2">
        {tiles.map((tile) => {
          const key = `${tile.item.mediaType}:${tile.item.tmdbId}`
          return (
            <DetailsDrawer
              key={key}
              item={tile.item}
              state={stateByKey.get(key)}
              stateByKey={stateByKey}
              collections={collections}
              trigger={(onOpen) => (
                <button
                  type="button"
                  onClick={onOpen}
                  className="group flex w-28 shrink-0 cursor-pointer flex-col gap-1.5 text-left sm:w-32"
                >
                  <div className="aspect-2/3 w-full overflow-hidden rounded-lg bg-muted transition-[filter] group-hover:brightness-90">
                    {tile.item.posterPath ? (
                      <Image
                        src={tmdbPosterUrl(tile.item.posterPath)}
                        alt={tile.item.title}
                        width={128}
                        height={192}
                        sizes="128px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        {tile.item.title}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {tile.item.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {tile.caption}
                    </p>
                  </div>
                </button>
              )}
            />
          )
        })}
      </div>
    </section>
  )
}

function formatShortDate(airDate: string) {
  const date = new Date(`${airDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) return airDate
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
