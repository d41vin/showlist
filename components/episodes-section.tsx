"use client"

import {
  CheckIcon,
  ChevronDownIcon,
  ImageNotFound01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useAction, useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import Image from "next/image"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/convex/_generated/api"
import { localTodayISO, tmdbStillUrl, type MediaItem } from "@/lib/media"
import { cn } from "@/lib/utils"

type ShowDetails = FunctionReturnType<typeof api.tmdb.details>
type SeasonEpisodes = FunctionReturnType<typeof api.tmdb.tvSeason>

// The details drawer's Episodes section: season chips, episode rows with
// watched ticks (PrimeWire-style one-tap), per-season bulk mark/clear.
export function EpisodesSection({
  item,
  data,
}: {
  item: MediaItem
  data: ShowDetails
}) {
  const seasons = data.seasons
  // Land on the season that's currently airing, else the most recent one
  // that aired, else the last regular season. Specials (S0) come last.
  const defaultSeason = useMemo(() => {
    if (data.nextEpisode !== null) return data.nextEpisode.season
    if (data.lastEpisode !== null) return data.lastEpisode.season
    const regular = seasons.filter((s) => s.season > 0)
    return (regular.at(-1) ?? seasons[0])?.season ?? 0
  }, [data.nextEpisode, data.lastEpisode, seasons])

  const [selected, setSelected] = useState<number | null>(null)
  const season = selected ?? defaultSeason

  const watches = useQuery(api.episodes.listForShow, { tmdbId: item.tmdbId })
  const toggleEpisode = useMutation(api.episodes.toggle)
  const setSeasonWatched = useMutation(api.episodes.setSeason)
  const seasonAction = useAction(api.tmdb.tvSeason)

  const watchedKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const watch of watches ?? []) {
      keys.add(`${watch.season}:${watch.episode}`)
    }
    return keys
  }, [watches])

  // Episode lists are fetched per season on demand and kept for the session —
  // flipping between seasons shouldn't refetch. Loading is derived: a season
  // with no cached data yet is loading.
  const [seasonCache, setSeasonCache] = useState<
    Record<number, SeasonEpisodes>
  >({})
  const [failedSeasons, setFailedSeasons] = useState<Set<number>>(new Set())
  const seasonData = seasonCache[season] ?? null

  useEffect(() => {
    if (seasonCache[season] !== undefined || failedSeasons.has(season)) {
      return
    }
    let cancelled = false
    seasonAction({ tmdbId: item.tmdbId, season })
      .then((data) => {
        if (!cancelled) {
          setSeasonCache((prev) => ({ ...prev, [season]: data }))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailedSeasons((prev) => new Set(prev).add(season))
        }
      })
    return () => {
      cancelled = true
    }
  }, [season, item.tmdbId, seasonAction, seasonCache, failedSeasons])

  const retrySeason = () => {
    setFailedSeasons((prev) => {
      const next = new Set(prev)
      next.delete(season)
      return next
    })
  }

  // Mutations only accept the exact snapshot shape — rebuild it.
  const snapshot = {
    tmdbId: item.tmdbId,
    mediaType: item.mediaType,
    title: item.title,
    posterPath: item.posterPath,
    year: item.year,
  }

  const episodes = seasonData?.episodes ?? []
  const watchedCount = episodes.filter((episode) =>
    watchedKeys.has(`${season}:${episode.episode}`)
  ).length
  const allMarked = episodes.length > 0 && watchedCount === episodes.length

  return (
    <div className="border-t px-5 py-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Episodes</h3>
        <span className="text-xs text-muted-foreground">
          {episodes.length > 0
            ? `${watchedCount}/${episodes.length} watched`
            : ""}
        </span>
      </div>

      {/* Season chips — horizontally scrollable when there are many seasons */}
      <div className="hide-scrollbar -mx-5 mt-2.5 flex gap-1.5 overflow-x-auto px-5 pb-1">
        {seasons.map((seasonSummary) => (
          <Button
            key={seasonSummary.season}
            variant={seasonSummary.season === season ? "default" : "secondary"}
            size="sm"
            className="shrink-0"
            onClick={() => setSelected(seasonSummary.season)}
          >
            {seasonChipLabel(seasonSummary)}
          </Button>
        ))}
      </div>

      {/* Season name + bulk action */}
      {episodes.length > 0 && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {seasonData?.name ?? `Season ${season}`}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2 h-7 px-2 text-xs"
            onClick={() =>
              setSeasonWatched({
                item: snapshot,
                season,
                episodes: episodes.map((episode) => episode.episode),
                watched: !allMarked,
              })
            }
          >
            <HugeiconsIcon icon={CheckIcon} />
            {allMarked ? "Clear all" : "Mark all"}
          </Button>
        </div>
      )}

      {/* Episode rows */}
      <div className="mt-2 flex flex-col">
        {failedSeasons.has(season) ? (
          <div className="flex flex-col items-start gap-2 py-4">
            <p className="text-sm text-muted-foreground">
              Couldn&rsquo;t load episodes.
            </p>
            <Button variant="outline" size="sm" onClick={retrySeason}>
              Try again
            </Button>
          </div>
        ) : seasonData === null ? (
          <EpisodeListSkeleton />
        ) : episodes.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No episodes listed for this season.
          </p>
        ) : (
          episodes.map((episode) => (
            <EpisodeRow
              key={episode.episode}
              season={season}
              episode={episode}
              watched={watchedKeys.has(`${season}:${episode.episode}`)}
              onToggle={() =>
                toggleEpisode({
                  item: snapshot,
                  season,
                  episode: episode.episode,
                })
              }
            />
          ))
        )}
      </div>
    </div>
  )
}

// "Season 1" → "S1"; non-standard names (e.g. "Specials") pass through.
function seasonChipLabel(season: ShowDetails["seasons"][number]) {
  return /^Season \d+$/.test(season.name)
    ? `S${season.season}`
    : season.name || `S${season.season}`
}

function EpisodeRow({
  season,
  episode,
  watched,
  onToggle,
}: {
  season: number
  episode: SeasonEpisodes["episodes"][number]
  watched: boolean
  onToggle: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const aired = episode.airDate === null || episode.airDate <= localTodayISO()
  const hasOverview =
    episode.overview !== null && episode.overview.trim() !== ""
  return (
    <div
      className={`rounded-lg px-1 py-1.5 hover:bg-accent/50 ${
        aired ? "" : "opacity-60"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <Checkbox
          checked={watched}
          onCheckedChange={() => onToggle()}
          aria-label={`Mark S${season}E${episode.episode} ${
            watched ? "unwatched" : "watched"
          }`}
        />
        {episode.stillPath ? (
          <Image
            src={tmdbStillUrl(episode.stillPath)}
            alt=""
            width={72}
            height={40}
            sizes="72px"
            className="aspect-video w-18 shrink-0 rounded-md object-cover"
          />
        ) : (
          <div className="flex aspect-video w-18 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <HugeiconsIcon icon={ImageNotFound01Icon} className="size-4" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {episode.episode}. {episode.name ?? "TBA"}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatAirDate(episode.airDate)}
            {episode.runtime !== null ? ` · ${episode.runtime}m` : ""}
            {!aired ? " · unaired" : ""}
          </p>
        </div>
        {hasOverview && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="-mr-1 text-muted-foreground"
            aria-expanded={expanded}
            aria-label={`Synopsis for S${season}E${episode.episode}`}
            onClick={() => setExpanded((prev) => !prev)}
          >
            <HugeiconsIcon
              icon={ChevronDownIcon}
              className={cn(
                "transition-transform",
                expanded && "rotate-180"
              )}
            />
          </Button>
        )}
      </div>
      {expanded && hasOverview && (
        <p className="mt-1.5 pl-14 pr-8 text-xs leading-relaxed text-muted-foreground">
          {episode.overview}
        </p>
      )}
    </div>
  )
}

function formatAirDate(airDate: string | null) {
  if (airDate === null) return "Air date unknown"
  const date = new Date(`${airDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) return airDate
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function EpisodeListSkeleton() {
  return (
    <div className="flex flex-col gap-2 py-1">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-center gap-2.5 px-1 py-1.5">
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="aspect-video w-18 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}
