"use client"

import { Skeleton } from "@/components/ui/skeleton"
import type { MediaItem } from "@/lib/media"

interface MediaRowProps {
  title: string
  items: MediaItem[]
  loading: boolean
  renderCard: (item: MediaItem) => React.ReactNode
  // Top-10 treatment: big rank numerals overlaid on the first ten posters.
  ranked?: boolean
}

export function MediaRow({
  title,
  items,
  loading,
  renderCard,
  ranked = false,
}: MediaRowProps) {
  if (!loading && items.length === 0) {
    return null
  }

  const visible = ranked ? items.slice(0, 10) : items

  return (
    <section className="flex flex-col gap-2">
      {title && <h2 className="text-lg font-semibold">{title}</h2>}
      <div className="hide-scrollbar flex gap-4 overflow-x-auto pb-2">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)
          : visible.map((item, index) => (
              <div
                key={`${item.mediaType}:${item.tmdbId}`}
                className="relative w-36 shrink-0 sm:w-44"
              >
                {renderCard(item)}
                {ranked && index < 10 && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -bottom-1.5 left-1.5 text-5xl font-extrabold text-white tabular-nums drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]"
                  >
                    {index + 1}
                  </span>
                )}
              </div>
            ))}
      </div>
    </section>
  )
}

function CardSkeleton() {
  return (
    <div className="flex w-36 shrink-0 flex-col gap-1.5 sm:w-44">
      <Skeleton className="aspect-2/3 w-full rounded-lg" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  )
}
