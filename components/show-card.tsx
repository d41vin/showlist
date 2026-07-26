import { ImageNotFound01Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Image from "next/image"

import { Button } from "@/components/ui/button"
import { tmdbPosterUrl, type MediaItem } from "@/lib/media"

export function ShowCard({ item }: { item: MediaItem }) {
  return (
    <div className="group flex flex-col gap-1.5">
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
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{item.mediaType === "movie" ? "Movie" : "Show"}</span>
          <span aria-hidden className="text-border">
            |
          </span>
          <span>{item.year ?? "—"}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto -mr-1.5 text-muted-foreground"
            aria-label={`Details for ${item.title}`}
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} />
          </Button>
        </div>
      </div>
    </div>
  )
}
