"use client"

import { ImageNotFound01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useAction } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"

import { ItemActions } from "@/components/item-actions"
import { MediaLink } from "@/components/media-link"
import { api } from "@/convex/_generated/api"
import {
  tmdbBackdropUrl,
  tmdbLogoUrl,
  tmdbPosterUrl,
  type CollectionSummary,
  type ItemState,
  type MediaItem,
} from "@/lib/media"
import { savedLabels } from "@/lib/search"

type Details = FunctionReturnType<typeof api.tmdb.details>

// Landscape library tile: backdrop artwork with the TMDB wordmark bottom-left
// and a Netflix-style panel of actions that expands below the card on hover
// or keyboard focus. The backdrop and logo live behind the TMDB details
// action (library rows only carry posters); it loads once the card nears the
// viewport and the poster stands in until then.
export function LibraryCard({
  item,
  state,
  collections,
}: {
  item: MediaItem
  state: ItemState | undefined
  collections: CollectionSummary[]
}) {
  const detailsAction = useAction(api.tmdb.details)
  const rootRef = useRef<HTMLDivElement>(null)
  const [nearViewport, setNearViewport] = useState(false)
  const [data, setData] = useState<Details | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const el = rootRef.current
    if (nearViewport || el === null) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearViewport(true)
          observer.disconnect()
        }
      },
      { rootMargin: "300px" }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [nearViewport])

  useEffect(() => {
    if (!nearViewport || data !== null || failed) return
    let cancelled = false
    detailsAction({ mediaType: item.mediaType, tmdbId: item.tmdbId })
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [nearViewport, data, failed, detailsAction, item.mediaType, item.tmdbId])

  const labels = savedLabels(state)

  return (
    <div
      ref={rootRef}
      className="group/card relative z-0 focus-within:z-20 hover:z-20"
    >
      <div className="relative aspect-video overflow-hidden rounded-xl bg-muted ring-1 ring-border/50 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-focus-within/card:scale-[1.03] group-hover/card:scale-[1.03]">
        <MediaLink
          item={item}
          aria-label={`Details for ${item.title}`}
          className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          {data?.backdropPath ? (
            <Image
              src={tmdbBackdropUrl(data.backdropPath, "w780")}
              alt=""
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 360px"
              className="object-cover"
            />
          ) : item.posterPath ? (
            <Image
              src={tmdbPosterUrl(item.posterPath)}
              alt=""
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 360px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <HugeiconsIcon icon={ImageNotFound01Icon} className="size-8" />
            </div>
          )}
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"
          />
          <div className="absolute inset-x-0 bottom-0 flex p-3 sm:p-4">
            {data?.logoPath ? (
              <Image
                src={tmdbLogoUrl(data.logoPath)}
                alt={item.title}
                width={220}
                height={80}
                sizes="(max-width: 640px) 50vw, 220px"
                className="max-h-10 w-auto max-w-[55%] object-contain object-left drop-shadow-lg sm:max-h-12"
              />
            ) : (
              <span className="max-w-[85%] truncate text-lg font-semibold text-white drop-shadow-lg">
                {item.title}
              </span>
            )}
          </div>
        </MediaLink>
        {labels.length > 0 && (
          <div className="pointer-events-none absolute top-2 right-2 flex flex-wrap justify-end gap-1">
            {labels.map((label) => (
              <span
                key={label}
                className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur"
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-full z-30 pt-1.5 opacity-0 transition-opacity duration-150 group-focus-within/card:pointer-events-auto group-focus-within/card:opacity-100 group-hover/card:pointer-events-auto group-hover/card:opacity-100">
        <div className="rounded-xl border bg-popover/95 p-2 shadow-xl ring-1 ring-foreground/5 backdrop-blur-xl">
          <div className="flex flex-wrap items-center gap-1.5">
            <ItemActions
              item={item}
              state={state}
              collections={collections}
              layout="row"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
