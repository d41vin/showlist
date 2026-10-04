"use client"

import { ImageNotFound01Icon, RefreshIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useAction, useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import Image from "next/image"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/convex/_generated/api"
import { localTodayISO, tmdbPosterThumbUrl, type MediaItem } from "@/lib/media"

type ScheduleEntry = FunctionReturnType<typeof api.schedule.get>[number]

// One list row: an episode of a show the user tracks, grouped under its
// air-date heading.
type Row = {
  key: string
  item: MediaItem
  season: number
  episode: number
  name: string | null
  airDate: string
  watched: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000

// The Schedule tab: upcoming + recently-aired episodes for EVERY TV show in
// the library, regardless of status — a show marked watched whose new season
// starts airing keeps appearing here. That's the point of the feature.
export function ScheduleTab({
  isAuthenticated,
  myItems,
}: {
  isAuthenticated: boolean
  myItems: MediaItem[] | undefined
}) {
  const tvItems = useMemo(
    () => (myItems ?? []).filter((item) => item.mediaType === "tv"),
    [myItems]
  )
  // String key instead of the array identity: ticking an episode flips the
  // watching flag and re-emits myItems — the schedule shouldn't refetch for
  // that, only when the set of shows itself changes.
  const tmdbIdsKey = useMemo(
    () => tvItems.map((item) => item.tmdbId).join(","),
    [tvItems]
  )

  const scheduleGet = useAction(api.schedule.get)
  const watches = useQuery(api.episodes.listMine, isAuthenticated ? {} : "skip")
  const toggleEpisode = useMutation(api.episodes.toggle)

  const [entries, setEntries] = useState<ScheduleEntry[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [retryNonce, setRetryNonce] = useState(0)

  useEffect(() => {
    const tmdbIds = tmdbIdsKey === "" ? [] : tmdbIdsKey.split(",").map(Number)
    if (!isAuthenticated || tmdbIds.length === 0) {
      return
    }
    let cancelled = false
    scheduleGet({ tmdbIds, today: localTodayISO() })
      .then((result) => {
        if (!cancelled) {
          setEntries(result)
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
  }, [isAuthenticated, tmdbIdsKey, scheduleGet, retryNonce])

  const watchedKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const watch of watches ?? []) {
      keys.add(`${watch.tmdbId}:${watch.season}:${watch.episode}`)
    }
    return keys
  }, [watches])

  const itemsByTmdbId = useMemo(() => {
    const map = new Map<number, MediaItem>()
    for (const item of tvItems) {
      if (!map.has(item.tmdbId)) {
        map.set(item.tmdbId, item)
      }
    }
    return map
  }, [tvItems])

  // Group episodes by air date, upcoming first, then catch-up.
  const { upcomingGroups, recentGroups } = useMemo(() => {
    const today = localTodayISO()
    const upcoming = new Map<string, Row[]>()
    const recent = new Map<string, Row[]>()
    for (const entry of entries ?? []) {
      const item = itemsByTmdbId.get(entry.tmdbId)
      if (item === undefined) continue
      for (const episode of entry.upcoming) {
        if (episode.airDate === null) continue
        pushToMap(upcoming, episode.airDate, {
          key: `${entry.tmdbId}:${episode.season}:${episode.episode}`,
          item,
          season: episode.season,
          episode: episode.episode,
          name: episode.name,
          airDate: episode.airDate,
          watched: watchedKeys.has(
            `${entry.tmdbId}:${episode.season}:${episode.episode}`
          ),
        })
      }
      const last = entry.lastEpisode
      if (last !== null && last.airDate !== null) {
        pushToMap(recent, last.airDate, {
          key: `${entry.tmdbId}:last:${last.season}:${last.episode}`,
          item,
          season: last.season,
          episode: last.episode,
          name: last.name,
          airDate: last.airDate,
          watched: watchedKeys.has(
            `${entry.tmdbId}:${last.season}:${last.episode}`
          ),
        })
      }
    }
    const upcomingGroups = sortedGroups(upcoming, today, 1)
    const recentGroups = sortedGroups(recent, today, -1)
    return { upcomingGroups, recentGroups }
  }, [entries, itemsByTmdbId, watchedKeys])

  const loading =
    myItems === undefined || (tvItems.length > 0 && entries === null && !failed)

  if (myItems !== undefined && tvItems.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Nothing to schedule yet — add TV shows to any of your lists and their
        next episodes will show up here.
      </p>
    )
  }
  if (failed && entries === null) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <p className="text-sm text-muted-foreground">
          Couldn&rsquo;t load your schedule.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRetryNonce((n) => n + 1)}
        >
          <HugeiconsIcon icon={RefreshIcon} />
          Try again
        </Button>
      </div>
    )
  }
  if (loading) {
    return <ScheduleSkeleton />
  }
  if (upcomingGroups.length === 0 && recentGroups.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Nothing airing in the next 30 days for your shows. Episodes that aired
        recently show up here too, so you can catch up.
      </p>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <ScheduleSection
        title="Upcoming"
        groups={upcomingGroups}
        onToggle={onToggle}
      />
      {recentGroups.length > 0 && (
        <ScheduleSection
          title="Catch up"
          groups={recentGroups}
          onToggle={onToggle}
        />
      )}
    </div>
  )

  function onToggle(row: Row) {
    void toggleEpisode({
      item: {
        tmdbId: row.item.tmdbId,
        mediaType: row.item.mediaType,
        title: row.item.title,
        posterPath: row.item.posterPath,
        year: row.item.year,
      },
      season: row.season,
      episode: row.episode,
    })
  }
}

function ScheduleSection({
  title,
  groups,
  onToggle,
}: {
  title: string
  groups: { label: string; rows: Row[] }[]
  onToggle: (row: Row) => void
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      {groups.map((group) => (
        <div key={`${title}-${group.label}`} className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">{group.label}</h3>
          {group.rows.map((row) => (
            <ScheduleRow key={row.key} row={row} onToggle={onToggle} />
          ))}
        </div>
      ))}
    </section>
  )
}

function pushToMap(map: Map<string, Row[]>, airDate: string, row: Row) {
  const rows = map.get(airDate)
  if (rows === undefined) {
    map.set(airDate, [row])
  } else {
    rows.push(row)
  }
}

// Groups sorted by date; direction 1 = future (soonest first), -1 = past
// (most recent first). Rows within a day sort by show title.
function sortedGroups(
  map: Map<string, Row[]>,
  today: string,
  direction: 1 | -1
) {
  return [...map.entries()]
    .sort((a, b) => direction * a[0].localeCompare(b[0]))
    .map(([airDate, rows]) => {
      rows.sort((a, b) => a.item.title.localeCompare(b.item.title))
      return { label: dayLabel(airDate, today), rows }
    })
}

function dayLabel(airDate: string, today: string) {
  if (airDate === today) return "Today"
  const nowMs = Date.parse(`${today}T00:00:00Z`)
  const diffDays = Math.round(
    (Date.parse(`${airDate}T00:00:00Z`) - nowMs) / DAY_MS
  )
  if (diffDays === 1) return "Tomorrow"
  if (diffDays === -1) return "Yesterday"
  const date = new Date(`${airDate}T00:00:00`)
  if (diffDays > 1 && diffDays <= 7) {
    return date.toLocaleDateString("en-US", { weekday: "long" })
  }
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

function ScheduleRow({
  row,
  onToggle,
}: {
  row: Row
  onToggle: (row: Row) => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-1 py-1.5 hover:bg-accent/50">
      {row.item.posterPath ? (
        <Image
          src={tmdbPosterThumbUrl(row.item.posterPath)}
          alt=""
          width={34}
          height={51}
          sizes="34px"
          className="aspect-2/3 w-9 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="flex aspect-2/3 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <HugeiconsIcon icon={ImageNotFound01Icon} className="size-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{row.item.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          S{row.season} · E{row.episode}
          {row.name ? ` — ${row.name}` : ""}
        </p>
      </div>
      <Checkbox
        checked={row.watched}
        onCheckedChange={() => onToggle(row)}
        aria-label={`Mark ${row.item.title} S${row.season}E${row.episode} ${
          row.watched ? "unwatched" : "watched"
        }`}
      />
    </div>
  )
}

function ScheduleSkeleton() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-1 py-1.5">
          <Skeleton className="aspect-2/3 w-9 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="size-4 rounded-sm" />
        </div>
      ))}
    </div>
  )
}
