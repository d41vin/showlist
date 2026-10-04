"use client"

import { MoreHorizontalIcon, StarIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useAction } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import Image from "next/image"
import { useState } from "react"

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
  type CollectionSummary,
  type ItemState,
  type MediaItem,
} from "@/lib/media"

export type ShowDetails = FunctionReturnType<typeof api.tmdb.details>

// The kebab/drawer details sheet: backdrop header with wordmark logo,
// action row, facts + overview, and the Episodes section for shows.
export function DetailsDrawer({
  item,
  state,
  collections,
}: {
  item: MediaItem
  state: ItemState | undefined
  collections: CollectionSummary[]
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
        className="-mr-1.5 ml-auto text-muted-foreground"
        aria-label={`Details for ${item.title}`}
        onClick={openDrawer}
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} />
      </Button>
      <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
        <DrawerContent>
          <div className="mx-auto flex min-h-0 w-full max-w-lg flex-col overflow-y-auto">
            {/* Backdrop header — tall, overblown image that cuts cleanly
                where the details section begins. Drawer's overflow-hidden
                clips the image to the rounded corners on the sides. */}
            <div className="relative shrink-0 overflow-hidden">
              {/* Backdrop image */}
              {data === null && !error ? (
                <div className="aspect-[16/9] w-full shrink-0 animate-pulse bg-muted" />
              ) : data?.backdropPath ? (
                <div className="relative aspect-[4/3] w-full shrink-0 bg-muted">
                  <Image
                    src={tmdbBackdropUrl(data.backdropPath)}
                    alt={`${item.title} backdrop`}
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
              {data !== null && !error && (
                <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 bg-gradient-to-t from-black/50 to-transparent px-5 pt-16 pb-4">
                  {data.logoPath ? (
                    <Image
                      src={tmdbLogoUrl(data.logoPath)}
                      alt={item.title}
                      width={220}
                      height={80}
                      sizes="220px"
                      className="mx-auto max-h-16 w-auto max-w-[70%] object-contain drop-shadow-lg"
                      priority
                    />
                  ) : (
                    <DrawerTitle className="text-xl font-bold text-white drop-shadow-lg">
                      {item.title}
                    </DrawerTitle>
                  )}
                  <DrawerHeader className="p-0 text-center">
                    <DrawerTitle
                      className={data.logoPath ? "sr-only" : "hidden"}
                    >
                      {item.title}
                    </DrawerTitle>
                    <DrawerDescription className="text-white/70">
                      {item.mediaType === "movie" ? "Movie" : "Show"}
                      {item.year ? ` · ${item.year}` : ""}
                    </DrawerDescription>
                  </DrawerHeader>
                </div>
              )}
            </div>

            {/* Actions */}
            {data !== null && !error && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 px-5 pt-3 md:justify-start">
                <ItemActions
                  item={item}
                  state={state}
                  collections={collections}
                  layout="row"
                />
              </div>
            )}

            {/* Details */}
            <div className="px-5 py-4 text-sm">
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

            {/* Episodes (shows with seasons only) */}
            {!error &&
              data !== null &&
              item.mediaType === "tv" &&
              data.seasons.length > 0 && (
                <EpisodesSection item={item} data={data} />
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
