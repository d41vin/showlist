"use client"

import { ImageNotFound01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Image from "next/image"
import { useEffect, useRef } from "react"
import { ItemActions } from "@/components/item-actions"
import { MediaLink } from "@/components/media-link"
import {
  tmdbPosterUrl,
  type CollectionSummary,
  type ItemState,
  type MediaItem,
} from "@/lib/media"
import { cn } from "@/lib/utils"

const LAYER_SELECTOR =
  '[data-slot="popover-content"], [data-slot="dialog-content"], [data-slot="dialog-overlay"]'

export function ShowCard({
  item,
  state,
  collections,
  overlayOpen,
  onOverlayOpenChange,
  badge,
}: {
  item: MediaItem
  state: ItemState | undefined
  collections: CollectionSummary[]
  overlayOpen?: boolean
  onOverlayOpenChange?: (open: boolean) => void
  badge?: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!overlayOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (
        !rootRef.current?.contains(event.target as Node) &&
        !(
          event.target instanceof Element &&
          event.target.closest(LAYER_SELECTOR)
        )
      )
        onOverlayOpenChange?.(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector(LAYER_SELECTOR))
        onOverlayOpenChange?.(false)
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
      <div className="relative aspect-2/3 overflow-hidden rounded-lg bg-muted">
        <MediaLink
          item={item}
          aria-label={`Details for ${item.title}`}
          className="absolute inset-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
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
        </MediaLink>
        {badge && (
          <span className="pointer-events-none absolute top-1.5 left-1.5 rounded-full bg-background/85 px-2 py-0.5 text-[11px] font-medium backdrop-blur">
            {badge}
          </span>
        )}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 flex flex-col justify-center gap-1.5 bg-black/70 p-3 transition-opacity",
            overlayOpen
              ? "opacity-100"
              : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
          )}
        >
          <div className="pointer-events-auto">
            <ItemActions item={item} state={state} collections={collections} />
          </div>
        </div>
      </div>
      <div className="min-w-0">
        <MediaLink
          item={item}
          data-search-title
          className="block w-full truncate text-left text-sm font-medium hover:underline"
        >
          {item.title}
        </MediaLink>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{item.mediaType === "movie" ? "Movie" : "Show"}</span>
          <span aria-hidden className="text-border">
            |
          </span>
          <span>{item.year ?? "—"}</span>
        </div>
      </div>
    </div>
  )
}
