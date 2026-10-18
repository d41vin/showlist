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

// The curated streaming services — exactly these, in display order. Ids
// are TMDB watch-provider ids (US region). Two quirks of TMDB's data: HBO
// Max has no direct entry, only its Amazon Channel (1825); Paramount+
// splits into Essential/Premium tiers — we use Premium. Display names are
// ours where TMDB's are clunky.
const CURATED_PROVIDERS: { id: number; displayName?: string }[] = [
  { id: 8 }, // Netflix
  { id: 9 }, // Amazon Prime Video
  { id: 1825, displayName: "HBO Max" },
  { id: 337 }, // Disney Plus
  { id: 350 }, // Apple TV (the Apple TV+ subscription service)
  { id: 2303, displayName: "Paramount+" },
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
  // Title lists keyed by `${providerId}:${railType}`; loading is derived.
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

  // The curated services only, in display order; anything missing from
  // TMDB's list drops out silently.
  const ordered: Providers = useMemo(() => {
    const list = providers ?? []
    return CURATED_PROVIDERS.flatMap(({ id, displayName }) => {
      const match = list.find((p) => p.id === id)
      if (match === undefined) {
        return []
      }
      return [{ ...match, name: displayName ?? match.name }]
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
  const titles =
    selectedKey !== null ? (titlesByKey[selectedKey] ?? null) : null

  useEffect(() => {
    if (selected === null) {
      return
    }
    const key = `${selected}:${railType}`
    if (titlesByKey[key] !== undefined || failedKeys.has(key)) {
      return
    }
    let cancelled = false
    discoverAction({
      mediaType: railType,
      watchProvider: selected,
      sort: "popularity",
    })
      .then((result) => {
        if (!cancelled) {
          setTitlesByKey((prev) => ({ ...prev, [key]: result.items }))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailedKeys((prev) => new Set(prev).add(key))
        }
      })
    return () => {
      cancelled = true
    }
  }, [selected, railType, titlesByKey, failedKeys, discoverAction])

  // Airing badges for the current TV rail — one schedule call per selection,
  // cheap because the details all come from the shared cache.
  const tvIdsKey = useMemo(
    () =>
      selectedKey !== null && railType === "tv"
        ? (titlesByKey[selectedKey] ?? [])
            .filter((t) => t.mediaType === "tv")
            .map((t) => t.tmdbId)
            .join(",")
        : "",
    [selectedKey, railType, titlesByKey]
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
      <div className="flex items-start justify-between gap-4">
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
              ? "Pick a service to see what's popular there"
              : `Popular ${railType === "movie" ? "movies" : "shows"} on this streaming service`}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
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
          floating as wordmarks. */}
      <div className="hide-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
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
                    : "opacity-60 hover:opacity-100"
                )}
              >
                {provider.logoPath && (
                  <Image
                    src={`https://image.tmdb.org/t/p/w154${provider.logoPath}`}
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
      {selected !== null && selectedKey !== null && (
        <div className="mt-5">
          {failedKeys.has(selectedKey) ? (
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
                      badge={badgesByKey[selectedKey]?.[title.tmdbId]}
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
