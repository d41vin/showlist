"use client"

import { useAction } from "convex/react"
import Image from "next/image"
import { useEffect, useState } from "react"

import { DetailsDrawer } from "@/components/details-drawer"
import { ItemActions } from "@/components/item-actions"
import type { CardGridState } from "@/components/use-item-state"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/convex/_generated/api"
import type { FunctionReturnType } from "convex/server"
import { tmdbBackdropUrl, tmdbLogoUrl, type MediaItem } from "@/lib/media"

type Details = FunctionReturnType<typeof api.tmdb.details>

// Discover hero: the top trending title as a billboard — backdrop art,
// wordmark logo, facts and the standard action row. Swiss restraint: the
// image and typography do the work, no extra chrome.
export function DiscoverHero({
  item,
  gridState,
}: {
  item: MediaItem
  gridState: CardGridState
}) {
  const details = useAction(api.tmdb.details)
  // Keyed by item so switching titles derives the loading state instead of
  // resetting it synchronously in an effect.
  const [loaded, setLoaded] = useState<{ key: string; data: Details } | null>(
    null
  )
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const itemKey = `${item.mediaType}:${item.tmdbId}`
  const data = loaded?.key === itemKey ? loaded.data : null
  const failed = failedKey === itemKey

  useEffect(() => {
    if (loaded?.key === itemKey || failedKey === itemKey) {
      return
    }
    let cancelled = false
    details({ mediaType: item.mediaType, tmdbId: item.tmdbId })
      .then((result) => {
        if (!cancelled) {
          setLoaded({ key: itemKey, data: result })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailedKey(itemKey)
        }
      })
    return () => {
      cancelled = true
    }
  }, [itemKey, item.mediaType, item.tmdbId, loaded, failedKey, details])

  if (failed) {
    return null
  }

  return (
    <section className="relative aspect-video max-h-[420px] w-full overflow-hidden rounded-xl bg-muted sm:aspect-[21/9]">
      {data === null ? (
        <Skeleton className="absolute inset-0 rounded-none" />
      ) : data.backdropPath !== null ? (
        <Image
          src={tmdbBackdropUrl(data.backdropPath)}
          alt=""
          fill
          sizes="(max-width: 1152px) 100vw, 1152px"
          className="object-cover"
          priority
        />
      ) : null}
      {/* Readability gradient — stronger at the bottom where content sits. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"
      />

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2.5 p-5 sm:p-6">
        {data !== null ? (
          <>
            {data.logoPath ? (
              <Image
                src={tmdbLogoUrl(data.logoPath)}
                alt={item.title}
                width={280}
                height={104}
                sizes="280px"
                className="max-h-14 w-auto max-w-[60%] self-start object-contain drop-shadow-lg sm:max-h-16"
                priority
              />
            ) : (
              <h2 className="max-w-[80%] text-2xl font-bold tracking-tight text-white drop-shadow-lg sm:text-3xl">
                {item.title}
              </h2>
            )}
            <HeroFacts data={data} item={item} />
            {data.overview !== null && data.overview !== "" && (
              <p className="line-clamp-2 max-w-2xl text-sm leading-relaxed text-white/85">
                {data.overview}
              </p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <ItemActions
                item={item}
                state={gridState.stateByKey.get(
                  `${item.mediaType}:${item.tmdbId}`
                )}
                collections={gridState.collections}
                layout="row"
              />
              <DetailsDrawer
                item={item}
                state={gridState.stateByKey.get(
                  `${item.mediaType}:${item.tmdbId}`
                )}
                collections={gridState.collections}
              />
            </div>
          </>
        ) : (
          <>
            <Skeleton className="h-10 w-56 bg-white/20" />
            <Skeleton className="h-4 w-64 bg-white/20" />
            <Skeleton className="h-8 w-full max-w-md bg-white/20" />
          </>
        )}
      </div>
    </section>
  )
}

function HeroFacts({ data, item }: { data: Details; item: MediaItem }) {
  const facts: string[] = [item.mediaType === "movie" ? "Movie" : "Show"]
  if (item.year !== null) {
    facts.push(item.year)
  }
  if (data.voteAverage !== null) {
    facts.push(`★ ${data.voteAverage.toFixed(1)}`)
  }
  if (data.genres.length > 0) {
    facts.push(data.genres.slice(0, 3).join(", "))
  }
  return (
    <p className="truncate text-xs font-medium tracking-wide text-white/75 uppercase">
      {facts.join(" · ")}
    </p>
  )
}
