"use client"

import { useAction } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import Image from "next/image"
import { useEffect, useMemo, useState } from "react"

import { ShowCard } from "@/components/show-card"
import type { CardGridState } from "@/components/use-item-state"
import { api } from "@/convex/_generated/api"
import { mediaKey, type MediaItem } from "@/lib/media"
import { cn } from "@/lib/utils"

type Providers = FunctionReturnType<typeof api.tmdb.watchProviders>

// Curated rail order — the big services first, then whatever else TMDB
// returns for the region. Unknown services keep their alphabetical spot.
const FEATURED_ORDER = [
  "Netflix",
  "Prime Video",
  "Disney+",
  "HBO Max",
  "Max",
  "Apple TV+",
  "Hulu",
  "Paramount+",
  "Peacock",
  "Crunchyroll",
]

// "Only on {service}" — the movy.sx pattern: a rail of provider logo tiles;
// picking one shows a scrollable rail of popular titles from that service.
// Availability region is fixed server-side (US).
export function ProviderRail({ gridState }: { gridState: CardGridState }) {
  const providersAction = useAction(api.tmdb.watchProviders)
  const discoverAction = useAction(api.tmdb.discover)

  const [providers, setProviders] = useState<Providers | null>(null)
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  // Title lists keyed by provider id; loading is derived.
  const [titlesByKey, setTitlesByKey] = useState<Record<number, MediaItem[]>>(
    {}
  )
  const [failedKeys, setFailedKeys] = useState<Set<number>>(new Set())

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

  const selectedProvider = useMemo(
    () => providers?.find((p) => p.id === selected) ?? null,
    [providers, selected]
  )
  const titles = selected !== null ? (titlesByKey[selected] ?? null) : null

  useEffect(() => {
    if (
      selected === null ||
      titlesByKey[selected] !== undefined ||
      failedKeys.has(selected)
    ) {
      return
    }
    let cancelled = false
    discoverAction({
      mediaType: "movie",
      watchProvider: selected,
      sort: "popularity",
    })
      .then((result) => {
        if (!cancelled) {
          setTitlesByKey((prev) => ({ ...prev, [selected]: result.items }))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailedKeys((prev) => new Set(prev).add(selected))
        }
      })
    return () => {
      cancelled = true
    }
  }, [selected, titlesByKey, failedKeys, discoverAction])

  // Featured services first (in the curated order), rest after. Plain
  // computation over a tiny list — deliberately not a hook so the early
  // returns below stay legal.
  const ordered: Providers = useMemo(() => {
    const list = providers ?? []
    const featured: typeof list = []
    for (const name of FEATURED_ORDER) {
      const match = list.find(
        (p) => p.name.toLowerCase() === name.toLowerCase()
      )
      if (match) {
        featured.push(match)
      }
    }
    const rest = list.filter((p) => !featured.includes(p))
    return [...featured, ...rest].slice(0, 12)
  }, [providers])

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
              : "Popular titles on this streaming service"}
          </p>
        </div>
      </div>

      {/* Provider logo tiles */}
      <div className="hide-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
        {providers === null
          ? Array.from({ length: 7 }, (_, i) => (
              <div
                key={i}
                className="h-14 w-24 shrink-0 animate-pulse rounded-xl bg-muted"
              />
            ))
          : ordered.map((provider) => (
              <button
                key={provider.id}
                type="button"
                aria-pressed={selected === provider.id}
                aria-label={provider.name}
                onClick={() =>
                  setSelected((prev) =>
                    prev === provider.id ? null : provider.id
                  )
                }
                className={cn(
                  "flex h-14 w-24 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-muted p-2.5 transition-all",
                  selected === provider.id
                    ? "ring-2 ring-primary"
                    : "opacity-80 hover:opacity-100"
                )}
              >
                {provider.logoPath && (
                  <Image
                    src={`https://image.tmdb.org/t/p/w154${provider.logoPath}`}
                    alt=""
                    width={72}
                    height={40}
                    sizes="72px"
                    className="max-h-full w-auto object-contain"
                  />
                )}
              </button>
            ))}
      </div>

      {/* Titles rail for the selected provider */}
      {selected !== null && (
        <div className="mt-5">
          {failedKeys.has(selected) ? (
            <p className="text-sm text-muted-foreground">
              Couldn&rsquo;t load titles for this service.
            </p>
          ) : titles === null ? (
            <div className="hide-scrollbar flex gap-4 overflow-x-auto pb-2">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="flex w-36 shrink-0 flex-col gap-1.5">
                  <div className="aspect-2/3 w-full animate-pulse rounded-lg bg-muted" />
                  <div className="h-4 w-3/4 rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : titles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing listed for this service right now.
            </p>
          ) : (
            <div className="hide-scrollbar flex gap-4 overflow-x-auto pb-2">
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
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
