"use client"

import { useAction } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import Image from "next/image"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { ShowCard } from "@/components/show-card"
import type { CardGridState } from "@/components/use-item-state"
import { api } from "@/convex/_generated/api"
import { RailScroller } from "@/components/rail-scroller"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  localDateOffset,
  localTodayISO,
  mediaKey,
  type MediaItem,
} from "@/lib/media"
import { cn } from "@/lib/utils"

type Providers = FunctionReturnType<typeof api.tmdb.watchProviders>
type ScheduleEntry = FunctionReturnType<
  typeof api.schedule.get
>["entries"][number]

// The curated streaming services — exactly these, alphabetically. Ids are
// TMDB watch-provider ids (US region). TMDB data quirks handled here: HBO
// Max exists as a standalone TV provider (1899) but only as its Amazon
// Channel (1825) for movies, so the two types filter by different ids;
// Paramount+ splits into tiers — we filter by the Premium tier (2303) but
// show a clean logo (the tier caption cropped off TMDB's artwork, hosted
// locally). Display names are ours where TMDB's are clunky.
const CURATED_PROVIDERS: {
  id: number
  displayName?: string
  movieId?: number
  tvId?: number
  logoOverride?: string
}[] = [
  { id: 9 }, // Amazon Prime Video
  { id: 350 }, // Apple TV (the Apple TV+ subscription service)
  { id: 337 }, // Disney Plus
  {
    id: 1899,
    displayName: "HBO Max",
    movieId: 1825,
    tvId: 1899,
    logoOverride: "/skypuy7SXuugIQeYg0IglmzoKaS.png",
  },
  { id: 8 }, // Netflix
  {
    id: 2303,
    displayName: "Paramount+",
    logoOverride: "/providers/paramount-plus.png",
  },
]

type ProviderSort = "newest" | "popularity" | "rating"

const PROVIDER_SORT_ITEMS: { value: ProviderSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "popularity", label: "Most popular" },
  { value: "rating", label: "Top rated" },
]

// "New season" when a season premiere (E1) airs inside the badge window
// [today-8, today+30], "New episode" for any other airing activity — both
// derived from the same range-based schedule computation the Schedule tab
// uses, over the shared tmdbCache.
function badgeFor(entry: ScheduleEntry): string | null {
  if (entry.episodes.some((episode) => episode.episode === 1)) {
    return "New season"
  }
  if (entry.episodes.length > 0) {
    return "New episode"
  }
  return null
}

// "Only on {service}" — the movy.sx pattern: a rail of provider logo tiles;
// picking one shows a scrollable rail of popular titles from that service,
// with a Movies/TV toggle. Availability region is fixed server-side (US).
export function ProviderRail({ gridState }: { gridState: CardGridState }) {
  const providersAction = useAction(api.tmdb.watchProviders)
  const discoverAction = useAction(api.tmdb.discover)
  const scheduleGet = useAction(api.schedule.get)

  const [providers, setProviders] = useState<Providers | null>(null)
  const [failed, setFailed] = useState(false)
  // The user's explicit service pick; null = "first service" (derived below
  // once the provider list loads).
  const [picked, setPicked] = useState<number | null>(null)
  const [railType, setRailType] = useState<"movie" | "tv">("movie")
  const [sort, setSort] = useState<ProviderSort>("newest")
  // Title lists keyed by `${providerId}:${railType}:${sort}`; loading is
  // derived.
  const [titlesByKey, setTitlesByKey] = useState<Record<string, MediaItem[]>>(
    {}
  )
  const [failedKeys, setFailedKeys] = useState<Set<string>>(new Set())
  // Airing badges for one TV rail (tmdbId → badge), keyed like titlesByKey.
  const [badgesByKey, setBadgesByKey] = useState<
    Record<string, Record<number, string>>
  >({})

  useEffect(() => {
    let cancelled = false
    providersAction({})
      .then((list) => {
        if (!cancelled) {
          setProviders(list)
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
  }, [providersAction])

  // The curated services only, in display order; logos come from TMDB's
  // list unless overridden locally. A service whose only TMDB entry lives
  // on the other media type's list still renders via its logoOverride.
  const ordered: Providers = useMemo(() => {
    const list = providers ?? []
    return CURATED_PROVIDERS.flatMap(({ id, displayName, logoOverride }) => {
      const match = list.find((p) => p.id === id)
      if (match === undefined && logoOverride === undefined) {
        return []
      }
      return [
        {
          id,
          name: displayName ?? match?.name ?? "",
          logoPath:
            logoOverride ??
            (match?.logoPath
              ? `https://image.tmdb.org/t/p/w154${match.logoPath}`
              : null),
        },
      ]
    })
  }, [providers])

  // Effective selection: the user's pick, else the first service — derived
  // during render, not stored in an effect, so the rail shows titles without
  // a click.
  const selected = picked ?? ordered[0]?.id ?? null
  const selectedProvider = useMemo(
    () => ordered.find((p) => p.id === selected) ?? null,
    [ordered, selected]
  )
  const selectedKey = selected !== null ? `${selected}:${railType}` : null
  const titlesKey = selectedKey !== null ? `${selectedKey}:${sort}` : null
  const titles = titlesKey !== null ? (titlesByKey[titlesKey] ?? null) : null
  // HBO Max filters by a different TMDB provider id per media type (1899
  // for TV, 1825 for movies); every other service uses its single id.
  const curated =
    selected !== null
      ? CURATED_PROVIDERS.find((c) => c.id === selected)
      : undefined

  useEffect(() => {
    if (titlesKey === null) {
      return
    }
    if (titlesByKey[titlesKey] !== undefined || failedKeys.has(titlesKey)) {
      return
    }
    let cancelled = false
    discoverAction({
      mediaType: railType,
      watchProvider:
        railType === "movie"
          ? (curated?.movieId ?? selected)
          : (curated?.tvId ?? selected),
      sort,
    })
      .then((result) => {
        if (!cancelled) {
          setTitlesByKey((prev) => ({ ...prev, [titlesKey]: result.items }))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailedKeys((prev) => new Set(prev).add(titlesKey))
        }
      })
    return () => {
      cancelled = true
    }
  }, [
    selected,
    curated,
    railType,
    sort,
    titlesKey,
    titlesByKey,
    failedKeys,
    discoverAction,
  ])

  // Airing badges for the current TV rail — one schedule call per selection,
  // cheap because the details all come from the shared cache.
  const tvIdsKey = useMemo(
    () =>
      selectedKey !== null && railType === "tv"
        ? (titlesByKey[`${selectedKey}:${sort}`] ?? [])
            .filter((t) => t.mediaType === "tv")
            .map((t) => t.tmdbId)
            .join(",")
        : "",
    [selectedKey, railType, sort, titlesByKey]
  )

  useEffect(() => {
    if (selectedKey === null || tvIdsKey === "") {
      return
    }
    if (badgesByKey[selectedKey] !== undefined) {
      return
    }
    let cancelled = false
    const today = localTodayISO()
    scheduleGet({
      tmdbIds: tvIdsKey.split(",").map(Number),
      from: localDateOffset(today, -8),
      to: localDateOffset(today, 30),
    })
      .then((result) => {
        if (cancelled) {
          return
        }
        const badges: Record<number, string> = {}
        for (const entry of result.entries) {
          const badge = badgeFor(entry)
          if (badge !== null) {
            badges[entry.tmdbId] = badge
          }
        }
        setBadgesByKey((prev) => ({ ...prev, [selectedKey]: badges }))
      })
      .catch(() => {
        // Badges are a bonus; a failed lookup just leaves the rail plain.
        if (!cancelled) {
          setBadgesByKey((prev) => ({ ...prev, [selectedKey]: {} }))
        }
      })
    return () => {
      cancelled = true
    }
  }, [selectedKey, tvIdsKey, badgesByKey, scheduleGet])

  if (failed || (providers !== null && providers.length === 0)) {
    return null
  }

  return (
    <section className="mb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">
            {selectedProvider === null ? (
              "Only on streaming"
            ) : (
              <>
                Only on{" "}
                <span className="text-primary">{selectedProvider.name}</span>
              </>
            )}
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {selectedProvider === null
              ? "Pick a service to see what's on there"
              : `${
                  sort === "newest"
                    ? "Newest"
                    : sort === "popularity"
                      ? "Popular"
                      : "Top-rated"
                } ${railType === "movie" ? "movies" : "shows"} on this streaming service`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Select
            items={PROVIDER_SORT_ITEMS}
            value={sort}
            onValueChange={(value) => setSort(value as ProviderSort)}
          >
            <SelectTrigger className="w-32" aria-label="Sort order">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDER_SORT_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(["movie", "tv"] as const).map((t) => (
            <Button
              key={t}
              variant={railType === t ? "default" : "secondary"}
              size="sm"
              onClick={() => setRailType(t)}
            >
              {t === "movie" ? "Movies" : "TV"}
            </Button>
          ))}
        </div>
      </div>

      {/* Provider tiles — TMDB's provider logos are opaque square "app
          icon" assets (no transparency), so they fill the tile instead of
          floating as wordmarks. The p-1 gutter gives the selection ring
          room so it doesn't clip against the scroll edges. */}
      <div className="hide-scrollbar mt-3 -ml-1 flex gap-2 overflow-x-auto p-1">
        {providers === null
          ? Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="h-14 w-14 shrink-0 animate-pulse rounded-xl bg-muted"
              />
            ))
          : ordered.map((provider) => (
              <button
                key={provider.id}
                type="button"
                aria-pressed={selected === provider.id}
                aria-label={provider.name}
                onClick={() => setPicked(provider.id)}
                className={cn(
                  "h-14 w-14 shrink-0 cursor-pointer overflow-hidden rounded-xl bg-muted transition-all",
                  selected === provider.id
                    ? "ring-2 ring-primary"
                    : "opacity-75 hover:opacity-100"
                )}
              >
                {provider.logoPath && (
                  <Image
                    src={provider.logoPath}
                    alt=""
                    width={56}
                    height={56}
                    sizes="56px"
                    className="size-full object-cover"
                  />
                )}
              </button>
            ))}
      </div>

      {/* Titles rail for the selected provider */}
      {selected !== null && titlesKey !== null && (
        <div className="mt-5">
          {failedKeys.has(titlesKey) ? (
            <p className="text-sm text-muted-foreground">
              Couldn&rsquo;t load titles for this service.
            </p>
          ) : titles === null ? (
            <RailScroller>
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="flex w-36 shrink-0 flex-col gap-1.5">
                  <div className="aspect-2/3 w-full animate-pulse rounded-lg bg-muted" />
                  <div className="h-4 w-3/4 rounded bg-muted" />
                </div>
              ))}
            </RailScroller>
          ) : titles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing listed for this service right now.
            </p>
          ) : (
            <RailScroller>
              {titles.map((title) => {
                const key = mediaKey(title)
                return (
                  <div key={key} className="w-36 shrink-0 sm:w-40">
                    <ShowCard
                      item={title}
                      state={gridState.stateByKey.get(key)}
                      stateByKey={gridState.stateByKey}
                      collections={gridState.collections}
                      overlayOpen={gridState.activeCardKey === key}
                      onOverlayOpenChange={(open) =>
                        gridState.onActiveCardKeyChange(open ? key : null)
                      }
                      badge={
                        selectedKey !== null
                          ? badgesByKey[selectedKey]?.[title.tmdbId]
                          : undefined
                      }
                    />
                  </div>
                )
              })}
            </RailScroller>
          )}
        </div>
      )}
    </section>
  )
}
