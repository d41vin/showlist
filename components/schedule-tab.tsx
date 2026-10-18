"use client"

import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ImageNotFound01Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useAction, useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import Image from "next/image"
import { useEffect, useMemo, useState } from "react"

import { DetailsDrawer } from "@/components/details-drawer"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/convex/_generated/api"
import {
  localTodayISO,
  localWeekRange,
  tmdbPosterThumbUrl,
  type CollectionSummary,
  type ItemState,
  type MediaItem,
} from "@/lib/media"
import {
  useCollectionSummaries,
  useItemStateMap,
} from "@/components/use-item-state"

type ScheduleResult = FunctionReturnType<typeof api.schedule.get>
type ScheduleEntry = ScheduleResult["entries"][number]

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

// The Schedule tab: a weekly view of episodes airing for EVERY TV show in
// the library, regardless of status — a show marked watched whose new season
// starts airing keeps appearing here. That's the point of the feature.
// Weeks run Monday–Sunday; navigation is free in both directions. Past weeks
// render whatever the active-season data covers, and the empty state says so
// honestly.
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
  // Real per-title state for the row drawers (subscriptions are deduped with
  // the other tabs' queries, so this costs nothing).
  const stateByKey = useItemStateMap(isAuthenticated)
  const collections = useCollectionSummaries(isAuthenticated)

  // 0 = the week containing today; negative = past weeks. Weeks are
  // Monday-start and computed against the user's local calendar.
  const [weekOffset, setWeekOffset] = useState(0)
  const { from, to } = useMemo(() => localWeekRange(weekOffset), [weekOffset])
  const today = useMemo(() => localTodayISO(), [])

  const [entries, setEntries] = useState<ScheduleEntry[] | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [failed, setFailed] = useState(false)
  const [retryNonce, setRetryNonce] = useState(0)

  useEffect(() => {
    const tmdbIds = tmdbIdsKey === "" ? [] : tmdbIdsKey.split(",").map(Number)
    if (!isAuthenticated || tmdbIds.length === 0) {
      return
    }
    let cancelled = false
    scheduleGet({ tmdbIds, from, to })
      .then((result) => {
        if (!cancelled) {
          setEntries(result.entries)
          setTruncated(result.truncated)
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
  }, [isAuthenticated, tmdbIdsKey, scheduleGet, retryNonce, from, to])

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

  // Group the week's episodes by air date, Monday → Sunday. Rows within a
  // day sort by show title.
  const groups = useMemo(() => {
    const byDate = new Map<string, Row[]>()
    for (const entry of entries ?? []) {
      const item = itemsByTmdbId.get(entry.tmdbId)
      if (item === undefined) continue
      for (const episode of entry.episodes) {
        if (episode.airDate === null) continue
        pushToMap(byDate, episode.airDate, {
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
    }
    return [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([airDate, rows]) => {
        rows.sort((a, b) => a.item.title.localeCompare(b.item.title))
        return { label: dayLabel(airDate, today), rows }
      })
  }, [entries, itemsByTmdbId, watchedKeys, today])

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

  const isPastWeek = to < today

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col items-center gap-1">
        <div className="flex w-full items-center justify-between">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous week"
            onClick={() => setWeekOffset((w) => w - 1)}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} />
          </Button>
          <p className="text-sm font-medium">
            {weekRangeLabel(from, to, today)}
          </p>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next week"
            onClick={() => setWeekOffset((w) => w + 1)}
          >
            <HugeiconsIcon icon={ArrowRight01Icon} />
          </Button>
        </div>
        {weekOffset !== 0 && (
          <button
            type="button"
            onClick={() => setWeekOffset(0)}
            className="cursor-pointer text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Back to this week
          </button>
        )}
      </div>
      {truncated && (
        <p className="text-xs text-muted-foreground">
          Showing the first 200 shows — trim your lists to see more.
        </p>
      )}
      {groups.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {isPastWeek
            ? "Nothing from your shows aired this week. Weeks further back can be incomplete — a show's full episode list lives in its details view."
            : "Nothing airs this week from your shows. Episodes from every TV show in your library appear here — flip forward to see upcoming weeks."}
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold">{group.label}</h3>
            {group.rows.map((row) => (
              <ScheduleRow
                key={row.key}
                row={row}
                onToggle={onToggle}
                state={stateByKey.get(
                  `${row.item.mediaType}:${row.item.tmdbId}`
                )}
                stateByKey={stateByKey}
                collections={collections}
              />
            ))}
          </div>
        ))
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

function pushToMap(map: Map<string, Row[]>, airDate: string, row: Row) {
  const rows = map.get(airDate)
  if (rows === undefined) {
    map.set(airDate, [row])
  } else {
    rows.push(row)
  }
}

// Week-view day heading: "Today", else "Monday · Oct 19".
function dayLabel(airDate: string, today: string) {
  if (airDate === today) return "Today"
  const date = new Date(`${airDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) return airDate
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" })
  const day = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
  return `${weekday} · ${day}`
}

// "Oct 19 – 25" / "Oct 27 – Nov 2"; the year suffix appears when the week
// doesn't sit inside today's year ("Dec 29 – Jan 4, 2027").
function weekRangeLabel(from: string, to: string, today: string) {
  const monthDay = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })
  const sameMonth = from.slice(0, 7) === to.slice(0, 7)
  const needsYear =
    from.slice(0, 4) !== today.slice(0, 4) ||
    to.slice(0, 4) !== today.slice(0, 4)
  const range = sameMonth
    ? `${monthDay(from)} – ${to.slice(8)}`
    : `${monthDay(from)} – ${monthDay(to)}`
  return needsYear ? `${range}, ${to.slice(0, 4)}` : range
}

function ScheduleRow({
  row,
  onToggle,
  state,
  stateByKey,
  collections,
}: {
  row: Row
  onToggle: (row: Row) => void
  state: ItemState | undefined
  stateByKey: Map<string, ItemState>
  collections: CollectionSummary[]
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
      <DetailsDrawer
        item={row.item}
        state={state}
        stateByKey={stateByKey}
        collections={collections}
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
