"use client"

import {
  BookmarkAdd01Icon,
  BookmarkCheck01Icon,
  CheckmarkCircle02Icon,
  EyeIcon,
  FolderAddIcon,
  ImageNotFound01Icon,
  MoreHorizontalIcon,
  StarIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useAction, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"

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
  tmdbPosterUrl,
  type ItemState,
  type MediaItem,
  type Sentiment,
} from "@/lib/media"
import { cn } from "@/lib/utils"

type ShowDetails = FunctionReturnType<typeof api.tmdb.details>

export function ShowCard({
  item,
  state,
  overlayOpen,
  onOverlayOpenChange,
}: {
  item: MediaItem
  state: ItemState | undefined
  overlayOpen: boolean
  onOverlayOpenChange: (open: boolean) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)

  // A persistently opened overlay closes on outside tap/click or Escape.
  useEffect(() => {
    if (!overlayOpen) {
      return
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        onOverlayOpenChange(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOverlayOpenChange(false)
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [overlayOpen, onOverlayOpenChange])

  return (
    <div ref={rootRef} className="group flex flex-col gap-1.5">
      <div
        className="relative aspect-2/3 cursor-pointer overflow-hidden rounded-lg bg-muted"
        onClick={() => onOverlayOpenChange(true)}
      >
        {item.posterPath ? (
          <Image
            src={tmdbPosterUrl(item.posterPath)}
            alt={`${item.title} poster`}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <HugeiconsIcon icon={ImageNotFound01Icon} className="size-8" />
          </div>
        )}
        {/* Action overlay: hover-revealed on desktop, persistent when opened. */}
        <div
          className={cn(
            "absolute inset-0 flex flex-col justify-center gap-1.5 bg-black/70 p-3 transition-opacity",
            overlayOpen
              ? "opacity-100"
              : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"
          )}
        >
          <ItemActions item={item} state={state} />
        </div>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{item.mediaType === "movie" ? "Movie" : "Show"}</span>
          <span aria-hidden className="text-border">
            |
          </span>
          <span>{item.year ?? "—"}</span>
          <DetailsDrawer item={item} state={state} />
        </div>
      </div>
    </div>
  )
}

// The in-app action buttons, shared by the card overlay (stacked) and the
// drawer (horizontal row).
function ItemActions({
  item,
  state,
  layout = "stack",
}: {
  item: MediaItem
  state: ItemState | undefined
  layout?: "stack" | "row"
}) {
  const toggleWatchlist = useMutation(api.items.toggleWatchlist)
  const toggleWatched = useMutation(api.items.toggleWatched)
  const setSentiment = useMutation(api.items.setSentiment)

  // Mutations only accept the exact snapshot shape, so rebuild it — list
  // items carry extra Convex doc fields.
  const snapshot = {
    tmdbId: item.tmdbId,
    mediaType: item.mediaType,
    title: item.title,
    posterPath: item.posterPath,
    year: item.year,
  }

  const inWatchlist = state?.inWatchlist ?? false
  const watched = state?.watched ?? false
  const sentiment = state?.sentiment
  const stacked = layout === "stack"

  return (
    <>
      <Button
        variant={inWatchlist ? "default" : "secondary"}
        size="sm"
        className={stacked ? "w-full" : undefined}
        aria-pressed={inWatchlist}
        onClick={() => toggleWatchlist({ item: snapshot })}
      >
        <HugeiconsIcon
          icon={inWatchlist ? BookmarkCheck01Icon : BookmarkAdd01Icon}
        />
        Watchlist
      </Button>
      <Button
        variant={watched ? "default" : "secondary"}
        size="sm"
        className={stacked ? "w-full" : undefined}
        aria-pressed={watched}
        onClick={() => toggleWatched({ item: snapshot })}
      >
        <HugeiconsIcon icon={watched ? CheckmarkCircle02Icon : EyeIcon} />
        Watched
      </Button>
      {/* Enabled in Session 3 (collections popover). */}
      <Button
        variant="secondary"
        size="sm"
        className={stacked ? "w-full" : undefined}
        disabled
      >
        <HugeiconsIcon icon={FolderAddIcon} />
        Collections
      </Button>
      <div
        className={cn("flex gap-1.5", stacked && "mt-1 justify-center")}
      >
        <SentimentButton
          value="liked"
          icon={ThumbsUpIcon}
          active={sentiment === "liked"}
          onToggle={() => setSentiment({ item: snapshot, sentiment: "liked" })}
        />
        <SentimentButton
          value="disliked"
          icon={ThumbsDownIcon}
          active={sentiment === "disliked"}
          onToggle={() =>
            setSentiment({ item: snapshot, sentiment: "disliked" })
          }
        />
      </div>
    </>
  )
}

function SentimentButton({
  value,
  icon,
  active,
  onToggle,
}: {
  value: Sentiment
  icon: typeof ThumbsUpIcon
  active: boolean
  onToggle: () => void
}) {
  return (
    <Button
      variant={active ? "default" : "secondary"}
      size="icon-sm"
      aria-pressed={active}
      aria-label={value === "liked" ? "Liked" : "Disliked"}
      onClick={onToggle}
    >
      <HugeiconsIcon icon={icon} />
    </Button>
  )
}

function DetailsDrawer({
  item,
  state,
}: {
  item: MediaItem
  state: ItemState | undefined
}) {
  const details = useAction(api.tmdb.details)
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<ShowDetails | null>(null)
  const [error, setError] = useState(false)

  const openDrawer = async () => {
    setOpen(true)
    if (data !== null) {
      return
    }
    setError(false)
    try {
      setData(await details({ mediaType: item.mediaType, tmdbId: item.tmdbId }))
    } catch {
      setError(true)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-xs"
        className="ml-auto -mr-1.5 text-muted-foreground"
        aria-label={`Details for ${item.title}`}
        onClick={openDrawer}
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} />
      </Button>
      <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
        <DrawerContent>
          <div className="mx-auto flex min-h-0 w-full max-w-lg flex-col overflow-y-auto">
            {/* Backdrop on top; placeholder while loading keeps layout stable. */}
            {data === null && !error ? (
              <div className="mx-4 mt-2 aspect-video shrink-0 animate-pulse rounded-lg bg-muted" />
            ) : data?.backdropPath ? (
              <div className="relative mx-4 mt-2 aspect-video shrink-0 overflow-hidden rounded-lg bg-muted">
                <Image
                  src={tmdbBackdropUrl(data.backdropPath)}
                  alt={`${item.title} backdrop`}
                  fill
                  sizes="(max-width: 640px) 100vw, 512px"
                  className="object-cover"
                />
              </div>
            ) : null}
            <DrawerHeader>
              <DrawerTitle>{item.title}</DrawerTitle>
              <DrawerDescription>
                {item.mediaType === "movie" ? "Movie" : "Show"}
                {item.year ? ` · ${item.year}` : ""}
              </DrawerDescription>
            </DrawerHeader>
            {/* The same in-app actions as the card overlay, as a row under
                the type/year line. Centered on the bottom sheet to match the
                header text, left-aligned from md up. */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 px-4 pt-3 md:justify-start">
              <ItemActions item={item} state={state} layout="row" />
            </div>
            <div className="px-4 py-4 text-sm">
              {error ? (
                <p className="text-muted-foreground">
                  Couldn&rsquo;t load details. Close and try again.
                </p>
              ) : data === null ? (
                <p className="text-muted-foreground">Loading details…</p>
              ) : (
                <DrawerDetails item={item} data={data} />
              )}
            </div>
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
        <p className="flex items-center gap-1.5 text-muted-foreground">
          {data.voteAverage !== null && (
            <HugeiconsIcon icon={StarIcon} className="size-3.5" />
          )}
          {facts.join(" · ")}
        </p>
      )}
      {data.genres.length > 0 && (
        <p className="text-muted-foreground">{data.genres.join(", ")}</p>
      )}
      {data.tagline !== null && <p className="italic">{data.tagline}</p>}
      {data.overview !== null && data.overview !== "" ? (
        <p className="leading-relaxed">{data.overview}</p>
      ) : (
        <p className="text-muted-foreground">No overview available.</p>
      )}
    </div>
  )
}
