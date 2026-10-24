"use client"

import {
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
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"

import { EpisodesSection } from "@/components/episodes-section"
import { ItemActions } from "@/components/item-actions"
import { useNavigationState } from "@/components/navigation-state"
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
  tmdbPosterUrl,
  type MediaItem,
} from "@/lib/media"

export type ShowDetails = FunctionReturnType<typeof api.tmdb.details>
type Trailer = FunctionReturnType<typeof api.tmdb.videos>
type TitleDetailsProps = {
  item: MediaItem
  data: ShowDetails
  variant: "page" | "drawer"
  onClose?: () => void
}

// Stop playback on every close path while preserving the drawer exit animation.
export const TitleDetailsOpenContext = createContext(true)

export function TitleDetails({
  item,
  data,
  variant,
  onClose,
}: TitleDetailsProps) {
  return (
    <TitleDetailsContent
      key={mediaKey(item)}
      item={item}
      data={data}
      variant={variant}
      onClose={onClose}
    />
  )
}

function TitleDetailsContent({
  item,
  data,
  variant,
  onClose,
}: TitleDetailsProps) {
  const { isAuthenticated } = useConvexAuth()
  const stateByKey = useItemStateMap(isAuthenticated)
  const collections = useCollectionSummaries(isAuthenticated)
  const recommendationsAction = useAction(api.tmdb.recommendations)
  const videosAction = useAction(api.tmdb.videos)
  const drawerOpen = useContext(TitleDetailsOpenContext)
  const isDrawer = variant === "drawer"
  const active = !isDrawer || drawerOpen
  const { mediaType, tmdbId } = item
  const currentKey = mediaKey(item)
  const titleId = useId()
  const overviewId = useId()
  const scrollRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const stopTrailerRef = useRef<HTMLButtonElement>(null)

  const [recs, setRecs] = useState<MediaItem[] | null>(null)
  const [recsFailed, setRecsFailed] = useState(false)
  const [trailer, setTrailer] = useState<Trailer | undefined>(undefined)
  const [trailerFailed, setTrailerFailed] = useState(false)
  const [playing, setPlaying] = useState(false)

  if (playing && (!active || !isAuthenticated)) {
    setPlaying(false)
  }

  useEffect(() => {
    if (!active) return
    scrollRef.current?.scrollTo({ top: 0 })
    titleRef.current?.focus({ preventScroll: true })
  }, [active])

  useEffect(() => {
    if (playing) stopTrailerRef.current?.focus({ preventScroll: true })
  }, [playing])

  useEffect(() => {
    if (!active || !isAuthenticated || recs !== null || recsFailed) return
    let cancelled = false
    recommendationsAction({ mediaType, tmdbId })
      .then((items) => {
        if (!cancelled) setRecs(items)
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
  ])

  const header = (
    <header
      className={
        isDrawer
          ? "flex min-w-0 shrink-0 items-center gap-2 px-4 py-2"
          : "mx-auto flex w-full max-w-2xl items-center gap-2 px-6 py-4"
      }
    >
      {isDrawer ? (
        <>
          <DrawerTitle
            ref={titleRef}
            id={titleId}
            tabIndex={-1}
            className="min-w-0 flex-1 truncate"
            title={item.title}
          >
            {item.title}
          </DrawerTitle>
          <DrawerDescription className="sr-only">
            {item.mediaType === "movie" ? "Movie" : "Show"}
            {item.year ? ` · ${item.year}` : ""}. Details and watch history.
          </DrawerDescription>
        </>
      ) : (
        <h1
          ref={titleRef}
          id={titleId}
          tabIndex={-1}
          className="min-w-0 flex-1 scroll-mt-20 text-2xl font-bold tracking-tight break-words"
        >
          {item.title}
        </h1>
      )}
      {playing && (
        <Button
          ref={stopTrailerRef}
          variant="secondary"
          size="sm"
          onClick={() => {
            setPlaying(false)
            titleRef.current?.focus({ preventScroll: true })
          }}
        >
          Stop trailer
        </Button>
      )}
      {isDrawer && (
        <Button
          variant="outline"
          size="sm"
          aria-label="Close details"
          onClick={() => {
            setPlaying(false)
            onClose?.()
          }}
        >
          <HugeiconsIcon icon={Cancel01Icon} />
          Close
        </Button>
      )}
    </header>
  )

  const content = (
    <>
      <div className="relative h-[clamp(15rem,38vw,25rem)] max-h-[55dvh] w-full overflow-hidden bg-muted">
        {playing && trailer ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&rel=0`}
            title={`${item.title}: ${trailer.name}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute inset-0 size-full bg-black"
          />
        ) : (
          <>
            {data.backdropPath && (
              <Image
                src={tmdbBackdropUrl(data.backdropPath, "w1280")}
                alt=""
                fill
                loading="eager"
                sizes={isDrawer ? "calc(100vw - 18px)" : "100vw"}
                className="object-cover"
              />
            )}
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-transparent"
            />
            <div className="absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-2xl flex-col gap-2 px-6 pb-5">
              {data.logoPath ? (
                <Image
                  src={tmdbLogoUrl(data.logoPath)}
                  alt={item.title}
                  width={260}
                  height={96}
                  sizes="(max-width: 480px) 60vw, 260px"
                  className="max-h-16 w-auto max-w-[65%] self-start object-contain drop-shadow-lg"
                  loading="eager"
                />
              ) : (
                <p className="line-clamp-3 text-2xl font-bold tracking-tight break-words drop-shadow-lg">
                  {item.title}
                </p>
              )}
              <HeroFacts data={data} item={item} />
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
          </>
        )}
      </div>

      <div className="mx-auto w-full max-w-2xl min-w-0 pb-6">
        {!isDrawer && <h2 className="sr-only">Title details</h2>}
        {isAuthenticated && (
          <div className="flex flex-wrap items-center gap-1.5 px-6 pt-4">
            <ItemActions
              item={item}
              state={stateByKey.get(currentKey)}
              collections={collections}
              layout="row"
            />
            {trailer && (
              <Button
                variant="secondary"
                size="sm"
                disabled={playing}
                onClick={() => {
                  setPlaying(true)
                  if (isDrawer) {
                    scrollRef.current?.scrollTo({ top: 0 })
                  } else {
                    titleRef.current?.scrollIntoView({ block: "start" })
                  }
                }}
              >
                <HugeiconsIcon icon={PlayIcon} />
                Play trailer
              </Button>
            )}
            {trailerFailed && (
              <div className="flex flex-wrap items-center gap-2">
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
              </div>
            )}
          </div>
        )}

        <section aria-labelledby={overviewId} className="px-6 py-4 text-sm">
          <h3 id={overviewId} className="sr-only">
            Overview
          </h3>
          <div className="flex flex-col gap-2">
            {data.tagline && (
              <p className="text-muted-foreground italic">{data.tagline}</p>
            )}
            {data.overview ? (
              <p className="text-[15px] leading-relaxed">{data.overview}</p>
            ) : (
              <p className="text-muted-foreground">No overview available.</p>
            )}
          </div>
        </section>

        {isAuthenticated &&
          item.mediaType === "tv" &&
          data.seasons.length > 0 && (
            <EpisodesSection key={currentKey} item={item} data={data} />
          )}

        {isAuthenticated && (
          <MoreLikeThis
            recs={recs}
            failed={recsFailed}
            variant={variant}
            onRetry={() => setRecsFailed(false)}
            onNavigate={() => setPlaying(false)}
          />
        )}
      </div>
    </>
  )

  if (isDrawer) {
    return (
      <>
        {header}
        <ScrollArea
          className="min-h-0 w-full min-w-0 flex-1"
          viewportRef={scrollRef}
        >
          {content}
        </ScrollArea>
      </>
    )
  }

  return (
    <article aria-labelledby={titleId} className="w-full min-w-0">
      {header}
      {content}
    </article>
  )
}

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

function MoreLikeThis({
  recs,
  failed,
  variant,
  onRetry,
  onNavigate,
}: {
  recs: MediaItem[] | null
  failed: boolean
  variant: TitleDetailsProps["variant"]
  onRetry: () => void
  onNavigate: () => void
}) {
  const headingId = useId()
  const { captureTitleOrigin, keepTitleOrigin } = useNavigationState()
  if (recs !== null && recs.length === 0) return null

  return (
    <section aria-labelledby={headingId} className="border-t px-6 py-4">
      <h3
        id={headingId}
        className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
      >
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
      ) : recs === null ? (
        <>
          <p role="status" className="sr-only">
            Loading recommendations…
          </p>
          <div
            aria-hidden
            className="hide-scrollbar -mx-6 mt-3 flex gap-2.5 overflow-x-auto px-6 py-1"
          >
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex w-20 shrink-0 flex-col gap-1">
                <Skeleton className="aspect-2/3 w-full rounded-md" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        </>
      ) : (
        <ul className="hide-scrollbar -mx-6 mt-3 flex gap-2.5 overflow-x-auto px-6 py-1">
          {recs.map((rec) => (
            <li key={mediaKey(rec)} className="w-20 shrink-0">
              <Link
                href={mediaHref(rec)}
                replace={variant === "drawer"}
                scroll={variant === "drawer" ? false : undefined}
                onNavigate={() => {
                  if (variant === "drawer") keepTitleOrigin()
                  else captureTitleOrigin()
                  onNavigate()
                }}
                aria-label={`Details for ${rec.title}${rec.year ? ` (${rec.year})` : ""}`}
                className="flex flex-col gap-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="aspect-2/3 w-full overflow-hidden rounded-md bg-muted transition-[filter] hover:brightness-90">
                  {rec.posterPath ? (
                    <Image
                      src={tmdbPosterUrl(rec.posterPath)}
                      alt=""
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
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
