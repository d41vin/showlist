"use client"

import {
  ArrowLeft01Icon,
  Cancel01Icon,
  ImageNotFound01Icon,
  MoreHorizontalIcon,
  PlayIcon,
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
  const videosAction = useAction(api.tmdb.videos)

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
  // Best YouTube trailer per title; undefined = not fetched yet, null =
  // none found (or the lookup failed — the button just stays hidden).
  const [trailerByKey, setTrailerByKey] = useState<
    Record<string, { key: string; name: string } | null>
  >({})
  // Key of the title whose trailer plays in the hero. Drilling to another
  // title or closing the drawer drops out of playback — derived from the
  // key comparison, so no reset effect is needed.
  const [playingKey, setPlayingKey] = useState<string | null>(null)

  const data = detailsByKey[currentKey] ?? null
  const recs = recsByKey[currentKey] ?? null
  const trailer = trailerByKey[currentKey]
  const playing = playingKey === currentKey

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
    if (!open || trailerByKey[currentKey] !== undefined) {
      return
    }
    let cancelled = false
    videosAction({ mediaType: current.mediaType, tmdbId: current.tmdbId })
      .then((result) => {
        if (!cancelled) {
          setTrailerByKey((prev) => ({ ...prev, [currentKey]: result }))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTrailerByKey((prev) => ({ ...prev, [currentKey]: null }))
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, currentKey, current, trailerByKey, videosAction])

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
            setPlayingKey(null)
          }
        }}
        showSwipeHandle
      >
        <DrawerContent>
          <div className="mx-auto flex min-h-0 w-full flex-col overflow-y-auto md:max-w-2xl">
            {/* Cinematic hero: backdrop bleeding into the page background,
                wordmark + facts + genre chips anchored bottom-left. While the
                trailer plays, the embed replaces the backdrop. */}
            <div className="relative shrink-0 overflow-hidden">
              {playing && trailer ? (
                <>
                  <DrawerTitle className="sr-only">{current.title}</DrawerTitle>
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&rel=0`}
                    title={trailer.name}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="aspect-[16/9] w-full shrink-0 bg-black"
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="absolute top-2 right-2 rounded-full bg-background/80 backdrop-blur"
                    aria-label="Close trailer"
                    onClick={() => setPlayingKey(null)}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} />
                  </Button>
                </>
              ) : (
                <>
                  {data === null && !failedKeys.has(currentKey) ? (
                    <div className="aspect-[16/9] w-full shrink-0 animate-pulse bg-muted" />
                  ) : data?.backdropPath ? (
                    <Image
                      src={tmdbBackdropUrl(data.backdropPath)}
                      alt={`${current.title} backdrop`}
                      width={1280}
                      height={720}
                      priority
                      sizes="(max-width: 768px) 100vw, 672px"
                      className="aspect-[16/9] w-full shrink-0 object-cover"
                    />
                  ) : (
                    <div className="aspect-[16/9] w-full shrink-0 bg-muted" />
                  )}

                  {/* Fade into the page in both themes */}
                  <div
                    aria-hidden
                    className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-transparent"
                  />

                  {data !== null && !failedKeys.has(currentKey) && (
                    <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 px-6 pb-5">
                      {data.logoPath ? (
                        <Image
                          src={tmdbLogoUrl(data.logoPath)}
                          alt={current.title}
                          width={260}
                          height={96}
                          sizes="260px"
                          className="max-h-16 w-auto max-w-[65%] self-start object-contain drop-shadow-lg"
                          priority
                        />
                      ) : (
                        <DrawerTitle className="text-2xl font-bold tracking-tight drop-shadow-lg">
                          {current.title}
                        </DrawerTitle>
                      )}
                      <DrawerDescription className="sr-only">
                        {current.mediaType === "movie" ? "Movie" : "Show"}
                        {current.year ? ` · ${current.year}` : ""}
                      </DrawerDescription>
                      <HeroFacts data={data} item={current} />
                      {data.genres.length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-1.5">
                          {data.genres.slice(0, 4).map((genre) => (
                            <span
                              key={genre}
                              className="rounded-full border border-border/70 px-2.5 py-0.5 text-xs text-foreground/85 backdrop-blur-sm"
                            >
                              {genre}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Drill-down navigation */}
            {drilling && (
              <div className="px-6 pt-4">
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
              <div className="flex flex-wrap items-center gap-1.5 px-6 pt-4">
                <ItemActions
                  item={current}
                  state={currentState}
                  collections={collections}
                  layout="row"
                />
                {trailer && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPlayingKey(currentKey)}
                  >
                    <HugeiconsIcon icon={PlayIcon} />
                    Play trailer
                  </Button>
                )}
              </div>
            )}

            {/* Overview */}
            <div className="px-6 py-4 text-sm">
              {failedKeys.has(currentKey) ? (
                <p className="text-muted-foreground">
                  Couldn&rsquo;t load details. Close and try again.
                </p>
              ) : data === null ? (
                <p className="text-muted-foreground">Loading details…</p>
              ) : (
                <DrawerDetails data={data} />
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

// Facts moved into the hero; the body is just the reading text now.
function DrawerDetails({ data }: { data: ShowDetails }) {
  return (
    <div className="flex flex-col gap-2">
      {data.tagline !== null && (
        <p className="text-muted-foreground italic">{data.tagline}</p>
      )}
      {data.overview !== null && data.overview !== "" ? (
        <p className="text-[15px] leading-relaxed">{data.overview}</p>
      ) : (
        <p className="text-muted-foreground">No overview available.</p>
      )}
    </div>
  )
}

// Type · year · rating · length/status — the streaming-modal meta line.
function HeroFacts({ data, item }: { data: ShowDetails; item: MediaItem }) {
  const facts: string[] = [item.mediaType === "movie" ? "Movie" : "Show"]
  if (item.year !== null) {
    facts.push(item.year)
  }
  if (data.voteAverage !== null) {
    facts.push(`★ ${data.voteAverage.toFixed(1)}`)
  }
  if (item.mediaType === "movie" && data.runtime !== null) {
    facts.push(`${data.runtime} min`)
  }
  if (item.mediaType === "tv" && data.numberOfSeasons !== null) {
    facts.push(
      `${data.numberOfSeasons} season${data.numberOfSeasons === 1 ? "" : "s"}`
    )
  }
  if (item.mediaType === "tv" && data.status !== null) {
    facts.push(data.status)
  }
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-medium tracking-wide text-foreground/80">
      {facts.map((fact, i) => (
        <span key={fact} className="flex items-center gap-1.5">
          {i > 0 && (
            <span aria-hidden className="text-foreground/30">
              ·
            </span>
          )}
          <span className="drop-shadow-sm">{fact}</span>
        </span>
      ))}
    </p>
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
    <div className="border-t px-6 py-4">
      <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        More like this
      </h3>
      <div className="hide-scrollbar -mx-6 mt-3 flex gap-2.5 overflow-x-auto px-6 pb-1">
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
