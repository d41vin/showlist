"use client"

import {
  ArrowLeft01Icon,
  ImageNotFound01Icon,
  MoreHorizontalIcon,
  StarIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useAction } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import Image from "next/image"
import { useEffect, useState } from "react"

import { EpisodesSection } from "@/components/episodes-section"
import { ItemActions } from "@/components/item-actions"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { api } from "@/convex/_generated/api"
import {
  tmdbBackdropUrl,
  tmdbLogoUrl,
  tmdbPosterUrl,
  type CollectionSummary,
  type ItemState,
  type MediaItem,
} from "@/lib/media"

export type ShowDetails = FunctionReturnType<typeof api.tmdb.details>

// The kebab/drawer details sheet: backdrop header with wordmark logo,
// action row, facts + overview, Episodes for shows, and a "More like this"
// row that drills down in place — clicking a recommendation swaps the whole
// sheet to that title (Back returns to where you started).
export function DetailsDrawer({
  item,
  state,
  stateByKey,
  collections,
  trigger,
}: {
  item: MediaItem
  state: ItemState | undefined
  // Optional map so drill-down items resolve their real saved state; the
  // opening card's own state is used as fallback for itself.
  stateByKey?: Map<string, ItemState>
  collections: CollectionSummary[]
  // Custom trigger (render prop receiving the open callback); defaults to
  // the standard kebab button.
  trigger?: (onOpen: () => void) => React.ReactNode
}) {
  const details = useAction(api.tmdb.details)
  const recommendationsAction = useAction(api.tmdb.recommendations)

  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState<MediaItem>(item)
  const currentKey = `${current.mediaType}:${current.tmdbId}`
  const originalKey = `${item.mediaType}:${item.tmdbId}`
  const drilling = currentKey !== originalKey

  // Per-title fetch caches for the drawer session; loading is derived.
  const [detailsByKey, setDetailsByKey] = useState<Record<string, ShowDetails>>(
    {}
  )
  const [failedKeys, setFailedKeys] = useState<Set<string>>(new Set())
  const [recsByKey, setRecsByKey] = useState<Record<string, MediaItem[]>>({})
  const [recsFailedKeys, setRecsFailedKeys] = useState<Set<string>>(new Set())

  const data = detailsByKey[currentKey] ?? null
  const recs = recsByKey[currentKey] ?? null

  useEffect(() => {
    if (
      !open ||
      detailsByKey[currentKey] !== undefined ||
      failedKeys.has(currentKey)
    ) {
      return
    }
    let cancelled = false
    details({ mediaType: current.mediaType, tmdbId: current.tmdbId })
      .then((result) => {
        if (!cancelled) {
          setDetailsByKey((prev) => ({ ...prev, [currentKey]: result }))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailedKeys((prev) => new Set(prev).add(currentKey))
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, currentKey, current, detailsByKey, failedKeys, details])

  useEffect(() => {
    if (
      !open ||
      data === null ||
      recsByKey[currentKey] !== undefined ||
      recsFailedKeys.has(currentKey)
    ) {
      return
    }
    let cancelled = false
    recommendationsAction({
      mediaType: current.mediaType,
      tmdbId: current.tmdbId,
    })
      .then((items) => {
        if (!cancelled) {
          setRecsByKey((prev) => ({ ...prev, [currentKey]: items }))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRecsFailedKeys((prev) => new Set(prev).add(currentKey))
        }
      })
    return () => {
      cancelled = true
    }
  }, [
    open,
    data,
    currentKey,
    current,
    recsByKey,
    recsFailedKeys,
    recommendationsAction,
  ])

  const currentState =
    currentKey === originalKey ? state : stateByKey?.get(currentKey)

  return (
    <>
      {trigger ? (
        trigger(() => setOpen(true))
      ) : (
        <Button
          variant="ghost"
          size="icon-xs"
          className="-mr-1.5 ml-auto text-muted-foreground"
          aria-label={`Details for ${item.title}`}
          onClick={() => setOpen(true)}
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} />
        </Button>
      )}
      <Drawer
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          // Reopening always starts from the card that was clicked.
          if (!next) {
            setCurrent(item)
          }
        }}
        showSwipeHandle
      >
        <DrawerContent>
          <div className="mx-auto flex min-h-0 w-full max-w-lg flex-col overflow-y-auto">
            {/* Backdrop header — tall, overblown image that cuts cleanly
                where the details section begins. Drawer's overflow-hidden
                clips the image to the rounded corners on the sides. */}
            <div className="relative shrink-0 overflow-hidden">
              {/* Backdrop image */}
              {data === null && !failedKeys.has(currentKey) ? (
                <div className="aspect-[16/9] w-full shrink-0 animate-pulse bg-muted" />
              ) : data?.backdropPath ? (
                <div className="relative aspect-[4/3] w-full shrink-0 bg-muted">
                  <Image
                    src={tmdbBackdropUrl(data.backdropPath)}
                    alt={`${current.title} backdrop`}
                    fill
                    sizes="640px"
                    className="object-cover"
                    priority
                  />
                </div>
              ) : (
                <div className="aspect-[16/9] w-full shrink-0 bg-muted" />
              )}

              {/* Logo + metadata overlaid at the bottom of the backdrop */}
              {data !== null && !failedKeys.has(currentKey) && (
                <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 bg-gradient-to-t from-black/50 to-transparent px-5 pt-16 pb-4">
                  {data.logoPath ? (
                    <Image
                      src={tmdbLogoUrl(data.logoPath)}
                      alt={current.title}
                      width={220}
                      height={80}
                      sizes="220px"
                      className="mx-auto max-h-16 w-auto max-w-[70%] object-contain drop-shadow-lg"
                      priority
                    />
                  ) : (
                    <DrawerTitle className="text-xl font-bold text-white drop-shadow-lg">
                      {current.title}
                    </DrawerTitle>
                  )}
                  <DrawerHeader className="p-0 text-center">
                    <DrawerTitle
                      className={data.logoPath ? "sr-only" : "hidden"}
                    >
                      {current.title}
                    </DrawerTitle>
                    <DrawerDescription className="text-white/70">
                      {current.mediaType === "movie" ? "Movie" : "Show"}
                      {current.year ? ` · ${current.year}` : ""}
                    </DrawerDescription>
                  </DrawerHeader>
                </div>
              )}
            </div>

            {/* Drill-down navigation */}
            {drilling && (
              <div className="px-5 pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2"
                  onClick={() => setCurrent(item)}
                >
                  <HugeiconsIcon icon={ArrowLeft01Icon} />
                  Back to {item.title}
                </Button>
              </div>
            )}

            {/* Actions */}
            {data !== null && !failedKeys.has(currentKey) && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 px-5 pt-3 md:justify-start">
                <ItemActions
                  item={current}
                  state={currentState}
                  collections={collections}
                  layout="row"
                />
              </div>
            )}

            {/* Details */}
            <div className="px-5 py-4 text-sm">
              {failedKeys.has(currentKey) ? (
                <p className="text-muted-foreground">
                  Couldn&rsquo;t load details. Close and try again.
                </p>
              ) : data === null ? (
                <p className="text-muted-foreground">Loading details…</p>
              ) : (
                <DrawerDetails item={current} data={data} />
              )}
            </div>

            {/* Episodes (shows with seasons only) */}
            {!failedKeys.has(currentKey) &&
              data !== null &&
              current.mediaType === "tv" &&
              data.seasons.length > 0 && (
                <EpisodesSection item={current} data={data} />
              )}

            {/* More like this */}
            {!failedKeys.has(currentKey) && data !== null && (
              <MoreLikeThis
                recs={recs}
                failed={recsFailedKeys.has(currentKey)}
                onSelect={setCurrent}
              />
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}

function DrawerDetails({ item, data }: { item: MediaItem; data: ShowDetails }) {
  const facts: string[] = []
  if (data.voteAverage !== null) {
    facts.push(`${data.voteAverage.toFixed(1)} / 10`)
  }
  if (item.mediaType === "movie" && data.runtime !== null) {
    facts.push(`${data.runtime} min`)
  }
  if (item.mediaType === "tv" && data.numberOfSeasons !== null) {
    facts.push(
      `${data.numberOfSeasons} season${data.numberOfSeasons === 1 ? "" : "s"}` +
        (data.numberOfEpisodes !== null
          ? ` · ${data.numberOfEpisodes} episodes`
          : "")
    )
  }
  if (data.releaseDate !== null) {
    facts.push(data.releaseDate)
  }
  return (
    <div className="flex flex-col gap-3">
      {facts.length > 0 && (
        <p className="flex items-center gap-1.5 text-muted-foreground text-shadow-sm">
          {data.voteAverage !== null && (
            <HugeiconsIcon icon={StarIcon} className="size-3.5" />
          )}
          {facts.join(" · ")}
        </p>
      )}
      {data.genres.length > 0 && (
        <p className="text-muted-foreground text-shadow-sm">
          {data.genres.join(", ")}
        </p>
      )}
      {data.tagline !== null && (
        <p className="italic text-shadow-sm">{data.tagline}</p>
      )}
      {data.overview !== null && data.overview !== "" ? (
        <p className="leading-relaxed text-shadow-sm">{data.overview}</p>
      ) : (
        <p className="text-muted-foreground">No overview available.</p>
      )}
    </div>
  )
}

// Poster row of native TMDB recommendations. Selecting a tile swaps the
// drawer to that title; failures stay quiet (it's a bonus section).
function MoreLikeThis({
  recs,
  failed,
  onSelect,
}: {
  recs: MediaItem[] | null
  failed: boolean
  onSelect: (item: MediaItem) => void
}) {
  if (failed || (recs !== null && recs.length === 0)) {
    return null
  }
  return (
    <div className="border-t px-5 py-4">
      <h3 className="text-sm font-semibold">More like this</h3>
      <div className="hide-scrollbar -mx-5 mt-2.5 flex gap-2.5 overflow-x-auto px-5 pb-1">
        {recs === null
          ? Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex w-20 shrink-0 flex-col gap-1">
                <div className="aspect-2/3 w-full animate-pulse rounded-md bg-muted" />
                <div className="h-3 w-3/4 rounded bg-muted" />
              </div>
            ))
          : recs.map((rec) => (
              <button
                key={`${rec.mediaType}:${rec.tmdbId}`}
                type="button"
                onClick={() => onSelect(rec)}
                className="flex w-20 shrink-0 cursor-pointer flex-col gap-1 text-left"
              >
                <div className="aspect-2/3 w-full overflow-hidden rounded-md bg-muted transition-[filter] hover:brightness-90">
                  {rec.posterPath ? (
                    <Image
                      src={tmdbPosterUrl(rec.posterPath)}
                      alt={rec.title}
                      width={120}
                      height={180}
                      sizes="80px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <HugeiconsIcon
                        icon={ImageNotFound01Icon}
                        className="size-5"
                      />
                    </div>
                  )}
                </div>
                <span className="truncate text-xs text-muted-foreground">
                  {rec.title}
                </span>
              </button>
            ))}
      </div>
    </div>
  )
}
