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

// The card IS the details affordance (the Netflix/Disney pattern): clicking
// the poster or the title opens the details drawer. The hover overlay
// carries only the quick actions and stops propagation so those clicks
// don't also open the drawer. On touch there is no hover — a tap opens the
// drawer, whose body holds the full action row.
export function ShowCard({
  item,
  state,
  stateByKey,
  collections,
  overlayOpen,
  onOverlayOpenChange,
  badge,
}: {
  item: MediaItem
  state: ItemState | undefined
  // Passed through to the details drawer so drill-down items resolve their
  // real saved state.
  stateByKey?: Map<string, ItemState>
  collections: CollectionSummary[]
  // Inert since the card click became the drawer trigger; the hover overlay
  // is purely hover-driven now. Kept so callers don't have to change yet.
  overlayOpen?: boolean
  onOverlayOpenChange?: (open: boolean) => void
  // Optional status chip on the poster (e.g. "New episode" on rail cards).
  badge?: string
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
        onOverlayOpenChange?.(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        document.querySelector(LAYER_SELECTOR) === null
      ) {
        onOverlayOpenChange?.(false)
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
    <DetailsDrawer
      item={item}
      state={state}
      stateByKey={stateByKey}
      collections={collections}
      trigger={(onOpen) => (
        <div
          ref={rootRef}
          className="group flex cursor-pointer flex-col gap-1.5"
          onClick={onOpen}
        >
          <div className="relative aspect-2/3 overflow-hidden rounded-lg bg-muted">
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
            {badge && (
              <span className="absolute top-1.5 left-1.5 rounded-full bg-background/85 px-2 py-0.5 text-[11px] font-medium backdrop-blur">
                {badge}
              </span>
            )}
            {/* Action overlay: hover-revealed on desktop. Clicks here are
                quick actions, not "open details". */}
            <div
              className={cn(
                "absolute inset-0 flex flex-col justify-center gap-1.5 bg-black/70 p-3 transition-opacity",
                overlayOpen
                  ? "opacity-100"
                  : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <ItemActions
                item={item}
                state={state}
                collections={collections}
              />
            </div>
          </div>
          <div className="min-w-0">
            <button
              type="button"
              className="block w-full truncate text-left text-sm font-medium hover:underline"
            >
              {item.title}
            </button>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{item.mediaType === "movie" ? "Movie" : "Show"}</span>
              <span aria-hidden className="text-border">
                |
              </span>
              <span>{item.year ?? "—"}</span>
            </div>
          </div>
        </div>
      )}
    />
  )
}
