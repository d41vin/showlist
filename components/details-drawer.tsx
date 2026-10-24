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
import { useEffect, useRef, useState } from "react"

import { EpisodesSection } from "@/components/episodes-section"
import { ItemActions } from "@/components/item-actions"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer"
import { ScrollArea } from "@/components/ui/scroll-area"
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
  open: controlledOpen,
  onOpenChange,
  onOpenChangeComplete,
  finalFocus,
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
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onOpenChangeComplete?: (open: boolean) => void
  finalFocus?: React.ComponentProps<typeof DrawerContent>["finalFocus"]
}) {
  const details = useAction(api.tmdb.details)
  const recommendationsAction = useAction(api.tmdb.recommendations)
  const videosAction = useAction(api.tmdb.videos)

  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const [current, setCurrent] = useState<MediaItem>(item)
  const { mediaType, tmdbId } = current
  const currentKey = `${mediaType}:${tmdbId}`
  const originalKey = `${item.mediaType}:${item.tmdbId}`
  const drilling = currentKey !== originalKey
  const scrollRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const stopTrailerRef = useRef<HTMLButtonElement>(null)

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
  const [playingKey, setPlayingKey] = useState<string | null>(null)
  const [session, setSession] = useState({ open, originalKey })

  // Also reset when a controlled parent closes the drawer or changes its item.
  // Compare identities, not item object references from reactive queries.
  if (session.open !== open || session.originalKey !== originalKey) {
    setSession({ open, originalKey })
    setCurrent(item)
    setPlayingKey(null)
  }

  const data = detailsByKey[currentKey] ?? null
  const recs = recsByKey[currentKey] ?? null
  const trailer = trailerByKey[currentKey]
  const playing = open && playingKey === currentKey

  const handleOpenChange = (next: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(next)
    if (!next) {
      setCurrent(item)
      setPlayingKey(null)
    }
    onOpenChange?.(next)
  }

  const selectItem = (next: MediaItem) => {
    setPlayingKey(null)
    setCurrent(next)
    scrollRef.current?.scrollTo({ top: 0 })
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    titleRef.current?.focus({ preventScroll: true })
  }, [currentKey])

  useEffect(() => {
    if (playing) stopTrailerRef.current?.focus({ preventScroll: true })
  }, [playing])

  useEffect(() => {
    if (
      !open ||
      detailsByKey[currentKey] !== undefined ||
      failedKeys.has(currentKey)
    ) {
      return
    }
    let cancelled = false
    details({ mediaType, tmdbId })
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
  }, [open, currentKey, mediaType, tmdbId, detailsByKey, failedKeys, details])

  useEffect(() => {
    if (!open || trailerByKey[currentKey] !== undefined) {
      return
    }
    let cancelled = false
    videosAction({ mediaType, tmdbId })
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
  }, [open, currentKey, mediaType, tmdbId, trailerByKey, videosAction])

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
    recommendationsAction({ mediaType, tmdbId })
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
    mediaType,
    tmdbId,
    recsByKey,
    recsFailedKeys,
    recommendationsAction,
  ])

  const currentState =
    currentKey === originalKey ? state : stateByKey?.get(currentKey)

  const retryDetails = () => {
    setFailedKeys((prev) => {
      const next = new Set(prev)
      next.delete(currentKey)
      return next
    })
  }

  const retryRecommendations = () => {
    setRecsFailedKeys((prev) => {
      const next = new Set(prev)
      next.delete(currentKey)
      return next
    })
  }

  return (
    <>
      {trigger ? (
        trigger(() => handleOpenChange(true))
      ) : (
        <Button
          variant="ghost"
          size="icon-xs"
          className="-mr-1.5 ml-auto text-muted-foreground"
          aria-label={`Details for ${item.title}`}
          onClick={() => handleOpenChange(true)}
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} />
        </Button>
      )}
      <Drawer
        open={open}
        onOpenChange={handleOpenChange}
        onOpenChangeComplete={onOpenChangeComplete}
        showSwipeHandle
      >
        <DrawerContent
          className="h-[calc(100dvh-6rem)]"
          finalFocus={finalFocus}
        >
          {/* Outside the scroll viewport, so close/back remain reachable. The
              single title and description label every loading/playback state. */}
          <div className="flex shrink-0 items-center gap-2 px-4 py-2">
            {drilling && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Back to ${item.title}`}
                title={`Back to ${item.title}`}
                onClick={() => selectItem(item)}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} />
              </Button>
            )}
            <DrawerTitle
              ref={titleRef}
              tabIndex={-1}
              className="min-w-0 flex-1 truncate"
              title={current.title}
            >
              {current.title}
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              {current.mediaType === "movie" ? "Movie" : "Show"}
              {current.year ? ` · ${current.year}` : ""}. Details and watch
              history.
            </DrawerDescription>
            {playing && (
              <Button
                ref={stopTrailerRef}
                variant="secondary"
                size="sm"
                onClick={() => {
                  setPlayingKey(null)
                  titleRef.current?.focus({ preventScroll: true })
                }}
              >
                Stop trailer
              </Button>
            )}
            <DrawerClose
              render={<Button variant="outline" size="sm" />}
              aria-label="Close details"
            >
              <HugeiconsIcon icon={Cancel01Icon} />
              Close
            </DrawerClose>
          </div>
          <ScrollArea className="min-h-0 flex-1" viewportRef={scrollRef}>
            {/* Full-width artwork, but a capped height even on wide displays. */}
            <div className="relative h-[clamp(15rem,38vw,25rem)] max-h-[55dvh] w-full overflow-hidden bg-muted">
              {playing && trailer ? (
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&rel=0`}
                  title={`${current.title}: ${trailer.name}`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="absolute inset-0 size-full bg-black"
                />
              ) : (
                <>
                  {data === null && !failedKeys.has(currentKey) ? (
                    <div className="absolute inset-0 animate-pulse bg-muted" />
                  ) : data?.backdropPath ? (
                    <Image
                      src={tmdbBackdropUrl(data.backdropPath, "w1280")}
                      alt=""
                      fill
                      loading="eager"
                      sizes="calc(100vw - 18px)"
                      className="object-cover"
                    />
                  ) : null}
                  <div
                    aria-hidden
                    className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-transparent"
                  />
                  <div className="absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-2xl flex-col gap-2 px-6 pb-5">
                    {data?.logoPath ? (
                      <Image
                        src={tmdbLogoUrl(data.logoPath)}
                        alt={current.title}
                        width={260}
                        height={96}
                        sizes="(max-width: 480px) 60vw, 260px"
                        className="max-h-16 w-auto max-w-[65%] self-start object-contain drop-shadow-lg"
                        loading="eager"
                      />
                    ) : (
                      <p className="line-clamp-3 text-2xl font-bold tracking-tight break-words drop-shadow-lg">
                        {current.title}
                      </p>
                    )}
                    {data !== null && (
                      <>
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
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Only the reading column is constrained; the scrollbar stays at
                the far edge of the full-width drawer. */}
            <div className="mx-auto w-full max-w-2xl pb-6">
              {data !== null && !failedKeys.has(currentKey) && (
                <div className="flex flex-wrap items-center gap-1.5 px-6 pt-4">
                  <ItemActions
                    key={currentKey}
                    item={current}
                    state={currentState}
                    collections={collections}
                    layout="row"
                  />
                  {trailer && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={playing}
                      onClick={() => {
                        setPlayingKey(currentKey)
                        scrollRef.current?.scrollTo({ top: 0 })
                      }}
                    >
                      <HugeiconsIcon icon={PlayIcon} />
                      Play trailer
                    </Button>
                  )}
                </div>
              )}

              <div className="px-6 py-4 text-sm">
                {failedKeys.has(currentKey) ? (
                  <div className="flex flex-col items-start gap-2">
                    <p role="alert" className="text-muted-foreground">
                      Couldn&rsquo;t load details.
                    </p>
                    <Button variant="outline" size="sm" onClick={retryDetails}>
                      Try again
                    </Button>
                  </div>
                ) : data === null ? (
                  <p role="status" className="text-muted-foreground">
                    Loading details…
                  </p>
                ) : (
                  <DrawerDetails data={data} />
                )}
              </div>

              {!failedKeys.has(currentKey) &&
                data !== null &&
                current.mediaType === "tv" &&
                data.seasons.length > 0 && (
                  <EpisodesSection
                    key={currentKey}
                    item={current}
                    data={data}
                  />
                )}

              {!failedKeys.has(currentKey) && data !== null && (
                <MoreLikeThis
                  recs={recs}
                  failed={recsFailedKeys.has(currentKey)}
                  onRetry={retryRecommendations}
                  onSelect={selectItem}
                />
              )}
            </div>
          </ScrollArea>
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

// Recommendations drill into this drawer rather than opening another modal.
function MoreLikeThis({
  recs,
  failed,
  onRetry,
  onSelect,
}: {
  recs: MediaItem[] | null
  failed: boolean
  onRetry: () => void
  onSelect: (item: MediaItem) => void
}) {
  if (recs !== null && recs.length === 0) {
    return null
  }
  return (
    <div className="border-t px-6 py-4">
      <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        More like this
      </h3>
      {failed ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p role="status" className="text-sm text-muted-foreground">
            Couldn&rsquo;t load recommendations.
          </p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="hide-scrollbar -mx-6 mt-3 flex gap-2.5 overflow-x-auto px-6 py-1">
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
                  aria-label={`Details for ${rec.title}`}
                  className="flex w-20 shrink-0 cursor-pointer flex-col gap-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                  <span className="w-full truncate text-xs text-muted-foreground">
                    {rec.title}
                  </span>
                </button>
              ))}
        </div>
      )}
    </div>
  )
}
