"use client"

import { ImageNotFound01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Image from "next/image"
import { useEffect, useRef } from "react"

import { DetailsDrawer } from "@/components/details-drawer"
import { ItemActions } from "@/components/item-actions"
import {
  tmdbPosterUrl,
  type CollectionSummary,
  type ItemState,
  type MediaItem,
} from "@/lib/media"
import { cn } from "@/lib/utils"

// Portaled layers (popover/dialog) opened from the overlay render outside
// the card's DOM subtree — interactions inside them must not close it.
const LAYER_SELECTOR =
  '[data-slot="popover-content"], [data-slot="dialog-content"], [data-slot="dialog-overlay"]'

function isInLayer(target: EventTarget | null) {
  return target instanceof Element && target.closest(LAYER_SELECTOR) !== null
}

export function ShowCard({
  item,
  state,
  collections,
  overlayOpen,
  onOverlayOpenChange,
}: {
  item: MediaItem
  state: ItemState | undefined
  collections: CollectionSummary[]
  overlayOpen: boolean
  onOverlayOpenChange: (open: boolean) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)

  // A persistently opened overlay closes on outside tap/click or Escape,
  // except while a popover/dialog opened from it is in play.
  useEffect(() => {
    if (!overlayOpen) {
      return
    }
    const onPointerDown = (e: PointerEvent) => {
      if (
        !rootRef.current?.contains(e.target as Node) &&
        !isInLayer(e.target)
      ) {
        onOverlayOpenChange(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        document.querySelector(LAYER_SELECTOR) === null
      ) {
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
          <ItemActions item={item} state={state} collections={collections} />
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
          <DetailsDrawer item={item} state={state} collections={collections} />
        </div>
      </div>
    </div>
  )
}
