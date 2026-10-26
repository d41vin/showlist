"use client"

import {
  ArrowLeft01Icon,
  Cancel01Icon,
  ImageNotFound01Icon,
  PlayIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useAction, useConvexAuth } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import Image from "next/image"
import Link from "next/link"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

import { EpisodesSection } from "@/components/episodes-section"
import { ItemActions } from "@/components/item-actions"
import {
  useNavigationState,
  useRetainedState,
} from "@/components/navigation-state"
import { RailScroller } from "@/components/rail-scroller"
import { ShowCard } from "@/components/show-card"
import { TitleMetadata, type TitleExtras } from "@/components/title-metadata"
import { Button } from "@/components/ui/button"
import { DrawerDescription, DrawerTitle } from "@/components/ui/drawer"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import {
  useCollectionSummaries,
  useItemStateMap,
} from "@/components/use-item-state"
import { api } from "@/convex/_generated/api"
import {
  mediaHref,
  mediaKey,
  tmdbBackdropUrl,
  tmdbLogoUrl,
  type CollectionSummary,
  type ItemState,
  type MediaItem,
} from "@/lib/media"

export type ShowDetails = FunctionReturnType<typeof api.tmdb.details>
type Trailer = FunctionReturnType<typeof api.tmdb.videos>

// Backdrops are 16:9; the hero crops them with `object-position` at 38% of
// the overflow. The bleed layer below the hero re-renders the rows the crop
// hides so the content section can appear to cover a continuing image.
const BACKDROP_ASPECT = 16 / 9
const HERO_CROP_Y = 0.38
const BLEED_HEIGHT_RATIO = 0.28
const BLEED_MASK =
  "linear-gradient(to bottom, black 0%, black 45%, transparent 100%)"
const GLASS_MASK =
  "linear-gradient(to bottom, black 0%, black 55%, transparent 100%)"
type TitleDetailsProps = {
  item: MediaItem
  data: ShowDetails
  variant: "page" | "drawer"
  onClose?: () => void
  onBack?: () => void
}

// Stop playback on every close path while preserving the drawer exit animation.
export const TitleDetailsOpenContext = createContext(true)

export function TitleDetails(props: TitleDetailsProps) {
  return <TitleDetailsContent key={mediaKey(props.item)} {...props} />
}

function TitleDetailsContent({
  item,
  data,
  variant,
  onClose,
  onBack,
}: TitleDetailsProps) {
  const { isAuthenticated } = useConvexAuth()
  const stateByKey = useItemStateMap(isAuthenticated)
  const collections = useCollectionSummaries(isAuthenticated)
  const recommendationsAction = useAction(api.tmdb.recommendations)
  const videosAction = useAction(api.tmdb.videos)
  const extrasAction = useAction(api.tmdb.titleExtras)
  const drawerOpen = useContext(TitleDetailsOpenContext)
  const isDrawer = variant === "drawer"
  const active = !isDrawer || drawerOpen
  const { mediaType, tmdbId } = item
  const currentKey = mediaKey(item)
  const titleId = useId()
  const overviewId = useId()
  const heroId = useId()
  const scrollRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)

  const [recs, setRecs] = useRetainedState<MediaItem[] | null>(
    `title:${currentKey}:recommendations`,
    null
  )
  const [recsFailed, setRecsFailed] = useState(false)
  const [trailer, setTrailer] = useRetainedState<Trailer | undefined>(
    `title:${currentKey}:trailer`,
    undefined
  )
  const [trailerFailed, setTrailerFailed] = useState(false)
  const [extras, setExtras] = useRetainedState<TitleExtras | undefined>(
    `title:${currentKey}:extras`,
    undefined
  )
  const [extrasFailed, setExtrasFailed] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [heroSize, setHeroSize] = useState<{
    width: number
    height: number
  } | null>(null)
  const bleedRailRef = useRef<HTMLDivElement>(null)
  const heroScrollRef = useRef(0)

  const syncBleed = useCallback((scrollLeft: number) => {
    heroScrollRef.current = scrollLeft
    const rail = bleedRailRef.current
    if (rail !== null) {
      rail.style.transform = `translate3d(${-scrollLeft}px, 0, 0)`
    }
  }, [])

  if (playing && (!active || !isAuthenticated)) {
    setPlaying(false)
  }

  useEffect(() => {
    if (active) titleRef.current?.focus({ preventScroll: true })
  }, [active])

  useEffect(() => {
    const el = heroRef.current
    if (el === null) return
    const update = () => {
      const width = el.clientWidth
      const height = el.clientHeight
      if (width === 0 || height === 0) return
      setHeroSize((current) =>
        current?.width === width && current.height === height
          ? current
          : { width, height }
      )
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    // ResizeObserver reports on the next rendered frame; resize fires
    // immediately, so a viewport change never leaves the bleed misaligned.
    window.addEventListener("resize", update)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", update)
    }
  }, [])

  useEffect(() => {
    if (!active || !isAuthenticated || recs !== null || recsFailed) return
    let cancelled = false
    recommendationsAction({ mediaType, tmdbId })
      .then((result) => {
        if (!cancelled) setRecs(result.items)
      })
      .catch(() => {
        if (!cancelled) setRecsFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [
    active,
    isAuthenticated,
    mediaType,
    tmdbId,
    recs,
    recsFailed,
    recommendationsAction,
    setRecs,
  ])

  useEffect(() => {
    if (!active || !isAuthenticated || trailer !== undefined || trailerFailed) {
      return
    }
    let cancelled = false
    videosAction({ mediaType, tmdbId })
      .then((result) => {
        if (!cancelled) setTrailer(result)
      })
      .catch(() => {
        if (!cancelled) setTrailerFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [
    active,
    isAuthenticated,
    mediaType,
    tmdbId,
    trailer,
    trailerFailed,
    videosAction,
    setTrailer,
  ])

  // Extras never block the base title, trailer, or recommendations.
  useEffect(() => {
    if (!active || !isAuthenticated || extras !== undefined || extrasFailed) {
      return
    }
    let cancelled = false
    extrasAction({ mediaType, tmdbId })
      .then((result) => {
        if (!cancelled) setExtras(result)
      })
      .catch(() => {
        if (!cancelled) setExtrasFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [
    active,
    isAuthenticated,
    mediaType,
    tmdbId,
    extras,
    extrasFailed,
    extrasAction,
    setExtras,
  ])

  const backdrops = [
    ...new Set(
      [data.backdropPath, ...(extras?.backdrops ?? [])].filter(
        (path): path is string => Boolean(path)
      )
    ),
  ].slice(0, 10)
  // The hero clip only reveals the top 38% of the image's vertical overflow;
  // the rest is real artwork the content section can sit in front of.
  const bleed = (() => {
    if (!isDrawer || heroSize === null || backdrops.length === 0) return null
    const renderedHeight = heroSize.width / BACKDROP_ASPECT
    const overflow = renderedHeight - heroSize.height
    if (overflow <= 1) return null
    const remaining = overflow * (1 - HERO_CROP_Y)
    const height = Math.min(
      remaining,
      Math.round(heroSize.height * BLEED_HEIGHT_RATIO)
    )
    if (height < 32) return null
    const visibleTop = overflow * HERO_CROP_Y + heroSize.height
    return {
      width: heroSize.width,
      height,
      objectPosition: (visibleTop / (renderedHeight - height)) * 100,
    }
  })()

  useLayoutEffect(() => {
    syncBleed(heroScrollRef.current)
  }, [syncBleed, bleed?.width, bleed?.height, playing])

  const OverviewHeading = isDrawer ? "h3" : "h2"

  const content = (
    <>
      <div ref={heroRef} id={heroId} className="relative w-full bg-muted">
        {/* Keep the gallery mounted, including its scroll position, during playback. */}
        <div
          className={playing ? "invisible" : undefined}
          aria-hidden={playing}
          inert={playing}
        >
          <div role="region" aria-label={`${item.title} artwork`}>
            <RailScroller
              paged
              autoAdvanceMs={active ? 8000 : undefined}
              onRailScroll={isDrawer ? syncBleed : undefined}
              controlsInset
              paginationOverlay
              className="snap-x snap-mandatory gap-0 pb-0"
            >
              {backdrops.length > 0 ? (
                backdrops.map((path, index) => (
                  <ArtworkSlide
                    key={path}
                    path={path}
                    title={item.title}
                    index={index}
                    eager={path === data.backdropPath}
                    isDrawer={isDrawer}
                  />
                ))
              ) : (
                <ArtworkSlide
                  path={null}
                  title={item.title}
                  index={0}
                  eager={false}
                  isDrawer={isDrawer}
                />
              )}
            </RailScroller>
          </div>
        </div>
        {playing && trailer && (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&rel=0`}
            title={`${item.title}: ${trailer.name}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute inset-0 size-full bg-black"
          />
        )}
        {data.logoPath && !playing && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/55 via-black/20 to-transparent pt-16 pb-12">
            <div className="mx-auto flex w-full max-w-2xl px-6">
              <Image
                src={tmdbLogoUrl(data.logoPath)}
                alt={item.title}
                width={260}
                height={96}
                sizes="(max-width: 480px) 60vw, 260px"
                loading="eager"
                className="max-h-14 w-auto max-w-[60%] object-contain drop-shadow-lg"
              />
            </div>
          </div>
        )}
        {!playing && (onBack || (isDrawer && onClose)) && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-2 p-3">
            {onBack && (
              <Button
                variant="secondary"
                size="sm"
                className="pointer-events-auto border-white/15 bg-black/35 text-white shadow-sm backdrop-blur-2xl backdrop-saturate-150 hover:bg-black/55 hover:text-white"
                aria-label={isDrawer ? "Back to previous title" : "Back"}
                onClick={() => {
                  setPlaying(false)
                  onBack()
                }}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} />
                Back
              </Button>
            )}
            {isDrawer && onClose && (
              <Button
                variant="secondary"
                size="sm"
                className="pointer-events-auto ml-auto border-white/15 bg-black/35 text-white shadow-sm backdrop-blur-2xl backdrop-saturate-150 hover:bg-black/55 hover:text-white"
                aria-label="Close details"
                onClick={() => {
                  setPlaying(false)
                  onClose()
                }}
              >
                <HugeiconsIcon icon={Cancel01Icon} />
                Close
              </Button>
            )}
          </div>
        )}
      </div>

      <div className={isDrawer ? "relative z-10" : undefined}>
        {bleed !== null && !playing && (
          <>
            {/* The artwork rows the hero crop hides, painted below the hero
                so the content section can sit in front of a continuing
                image instead of a hard cut. Mirrored to the artwork rail. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 z-0 overflow-hidden"
              style={{
                height: bleed.height,
                maskImage: BLEED_MASK,
                WebkitMaskImage: BLEED_MASK,
              }}
            >
              <div ref={bleedRailRef} className="flex">
                {backdrops.map((path) => (
                  <div
                    key={path}
                    className="relative shrink-0"
                    style={{ width: bleed.width, height: bleed.height }}
                  >
                    <Image
                      src={tmdbBackdropUrl(path, "w1280")}
                      alt=""
                      fill
                      sizes={`${Math.round(bleed.width)}px`}
                      loading="lazy"
                      className="object-cover"
                      style={{
                        objectPosition: `50% ${bleed.objectPosition}%`,
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
            {data.logoPath && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 z-0 bg-gradient-to-b from-black/55 via-black/20 to-transparent"
                style={{ height: bleed.height }}
              />
            )}
            {/* Frosted layer the content sits on. It shares the hero
                buttons' blur recipe and fades out so no strip edge shows. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 z-[1] bg-popover/50 backdrop-blur-2xl backdrop-saturate-150"
              style={{
                height: bleed.height,
                maskImage: GLASS_MASK,
                WebkitMaskImage: GLASS_MASK,
              }}
            />
          </>
        )}
        <div className="relative z-10 mx-auto w-full max-w-2xl min-w-0 pb-6">
          <div className="flex flex-wrap items-center justify-center gap-1.5 px-6 pt-4">
            {isAuthenticated && (
              <ItemActions
                item={item}
                state={stateByKey.get(currentKey)}
                collections={collections}
                layout="row"
              />
            )}
            {isAuthenticated && trailer && (
              <Button
                variant="secondary"
                size="sm"
                aria-controls={heroId}
                onClick={() => {
                  setPlaying((value) => !value)
                  if (!playing) {
                    if (isDrawer) scrollRef.current?.scrollTo({ top: 0 })
                    else heroRef.current?.scrollIntoView({ block: "start" })
                  }
                }}
              >
                <HugeiconsIcon icon={playing ? Cancel01Icon : PlayIcon} />
                {playing ? "Stop trailer" : "Play trailer"}
              </Button>
            )}
            {playing && onBack && (
              <Button
                variant="secondary"
                size="sm"
                aria-label={isDrawer ? "Back to previous title" : "Back"}
                onClick={() => {
                  setPlaying(false)
                  onBack()
                }}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} />
                Back
              </Button>
            )}
            {isDrawer && playing && onClose && (
              <Button
                variant="outline"
                size="sm"
                aria-label="Close details"
                onClick={() => {
                  setPlaying(false)
                  onClose()
                }}
              >
                <HugeiconsIcon icon={Cancel01Icon} />
                Close
              </Button>
            )}
            {isAuthenticated && trailerFailed && (
              <>
                <p role="status" className="text-sm text-muted-foreground">
                  Couldn&rsquo;t load trailer.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTrailerFailed(false)}
                >
                  Retry trailer
                </Button>
              </>
            )}
          </div>

          <header className="flex flex-col gap-2 px-6 pt-5">
            {isDrawer ? (
              <>
                <DrawerTitle
                  ref={titleRef}
                  id={titleId}
                  tabIndex={-1}
                  className="text-2xl break-words"
                >
                  {item.title}
                </DrawerTitle>
                <DrawerDescription className="sr-only">
                  {item.mediaType === "movie" ? "Movie" : "Show"}
                  {item.year ? ` · ${item.year}` : ""}. Details and watch
                  history.
                </DrawerDescription>
              </>
            ) : (
              <h1
                ref={titleRef}
                id={titleId}
                tabIndex={-1}
                className="text-2xl font-semibold break-words"
              >
                {item.title}
              </h1>
            )}
            <TitleFacts data={data} item={item} />
          </header>

          <section aria-labelledby={overviewId} className="px-6 py-4 text-sm">
            <OverviewHeading id={overviewId} className="sr-only">
              Overview
            </OverviewHeading>
            <div className="flex flex-col gap-2">
              {data.tagline && (
                <p className="text-muted-foreground italic">{data.tagline}</p>
              )}
              {data.overview ? (
                <p className="text-sm leading-relaxed">{data.overview}</p>
              ) : (
                <p className="text-muted-foreground">No overview available.</p>
              )}
            </div>
          </section>

          <TitleMetadata
            item={item}
            data={data}
            extras={extras}
            failed={extrasFailed}
            loading={
              active && isAuthenticated && extras === undefined && !extrasFailed
            }
            onRetry={() => {
              setExtras(undefined)
              setExtrasFailed(false)
            }}
            onNavigate={() => setPlaying(false)}
          />

          {isAuthenticated &&
            item.mediaType === "tv" &&
            data.seasons.length > 0 && (
              <EpisodesSection key={currentKey} item={item} data={data} />
            )}

          {isAuthenticated && (
            <MoreLikeThis
              item={item}
              recs={recs}
              failed={recsFailed}
              variant={variant}
              stateByKey={stateByKey}
              collections={collections}
              onRetry={() => setRecsFailed(false)}
              onNavigate={() => setPlaying(false)}
            />
          )}
        </div>
      </div>
    </>
  )

  if (isDrawer) {
    return (
      <ScrollArea
        className="min-h-0 w-full min-w-0 flex-1"
        viewportRef={scrollRef}
      >
        {content}
      </ScrollArea>
    )
  }

  return (
    <article aria-labelledby={titleId} className="w-full min-w-0">
      {content}
    </article>
  )
}

function ArtworkSlide({
  path,
  title,
  index,
  eager,
  isDrawer,
}: {
  path: string | null
  title: string
  index: number
  eager: boolean
  isDrawer: boolean
}) {
  const [failed, setFailed] = useState(false)

  return (
    <div className="relative h-[clamp(15rem,38vw,28.125rem)] max-h-[55dvh] w-full min-w-0 shrink-0 snap-start">
      {path && !failed ? (
        <Image
          src={tmdbBackdropUrl(path, "w1280")}
          alt={
            index === 0
              ? `Featured artwork for ${title}`
              : `Backdrop artwork ${index + 1} for ${title}`
          }
          fill
          loading={eager ? "eager" : "lazy"}
          sizes={isDrawer ? "calc(100vw - 18px)" : "100vw"}
          className="object-cover object-[50%_38%]"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
          <HugeiconsIcon
            icon={ImageNotFound01Icon}
            className="size-8"
            aria-hidden
          />
          <p className="text-sm">Artwork unavailable for {title}.</p>
        </div>
      )}
    </div>
  )
}

function TitleFacts({ data, item }: { data: ShowDetails; item: MediaItem }) {
  const facts: string[] = [item.mediaType === "movie" ? "Movie" : "Show"]
  if (item.year !== null) facts.push(item.year)
  if (data.voteAverage !== null) {
    facts.push(`TMDB ${data.voteAverage.toFixed(1)}/10`)
  }
  if (item.mediaType === "movie" && data.runtime !== null && data.runtime > 0) {
    facts.push(`${data.runtime} min`)
  }
  if (item.mediaType === "tv" && data.numberOfSeasons !== null) {
    facts.push(
      `${data.numberOfSeasons} season${data.numberOfSeasons === 1 ? "" : "s"}`
    )
  }
  if (item.mediaType === "tv" && data.status !== null) facts.push(data.status)

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
      {facts.map((fact, i) => (
        <span key={`${i}:${fact}`} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden>·</span>}
          <span>{fact}</span>
        </span>
      ))}
    </p>
  )
}

function MoreLikeThis({
  item,
  recs,
  failed,
  variant,
  stateByKey,
  collections,
  onRetry,
  onNavigate,
}: {
  item: MediaItem
  recs: MediaItem[] | null
  failed: boolean
  variant: TitleDetailsProps["variant"]
  stateByKey: Map<string, ItemState>
  collections: CollectionSummary[]
  onRetry: () => void
  onNavigate: () => void
}) {
  const headingId = useId()
  const { captureTitleOrigin } = useNavigationState()
  const Heading = variant === "drawer" ? "h3" : "h2"
  if (recs !== null && recs.length === 0) return null

  return (
    <section aria-labelledby={headingId} className="border-t px-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading id={headingId} className="text-sm font-semibold">
          More like this
        </Heading>
        {recs !== null && recs.length > 0 && (
          <Link
            href={`${mediaHref(item)}/recommendations`}
            replace={false}
            scroll={variant !== "drawer"}
            onNavigate={() => {
              captureTitleOrigin()
              onNavigate()
            }}
            aria-label={`View all recommendations for ${item.title}`}
            className="text-sm underline underline-offset-4"
          >
            View all
          </Link>
        )}
      </div>
      {failed ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p role="status" className="text-sm text-muted-foreground">
            Couldn&rsquo;t load recommendations.
          </p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : recs === null ? (
        <>
          <p role="status" className="sr-only">
            Loading recommendations…
          </p>
          <div aria-hidden className="mt-3 flex gap-3 overflow-hidden">
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="flex w-28 shrink-0 flex-col gap-1.5 sm:w-32"
              >
                <Skeleton className="aspect-2/3 w-full rounded-lg" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-3">
          <RailScroller>
            {recs.map((rec) => {
              const key = mediaKey(rec)
              return (
                <div key={key} className="w-28 shrink-0 sm:w-32">
                  <ShowCard
                    item={rec}
                    state={stateByKey.get(key)}
                    collections={collections}
                    sizes="(min-width: 640px) 128px, 112px"
                    compact
                    onNavigate={() => {
                      captureTitleOrigin()
                      onNavigate()
                    }}
                  />
                </div>
              )
            })}
          </RailScroller>
        </div>
      )}
    </section>
  )
}
