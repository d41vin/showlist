"use client"

import { Skeleton } from "@/components/ui/skeleton"
import type { MediaItem } from "@/lib/media"

interface MediaRowProps {
  title: string
  items: MediaItem[]
  loading: boolean
  renderCard: (item: MediaItem) => React.ReactNode
}

export function MediaRow({ title, items, loading, renderCard }: MediaRowProps) {
  if (!loading && items.length === 0) {
    return null
  }

  return (
    <section className="flex flex-col gap-2">
      {title && <h2 className="text-lg font-semibold">{title}</h2>}
      <div className="hide-scrollbar flex gap-4 overflow-x-auto pb-2">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)
          : items.map((item) => (
              <div key={`${item.mediaType}:${item.tmdbId}`} className="w-36 sm:w-44 shrink-0">
                {renderCard(item)}
              </div>
            ))}
      </div>
    </section>
  )
}

function CardSkeleton() {
  return (
    <div className="flex w-36 sm:w-44 shrink-0 flex-col gap-1.5">
      <Skeleton className="aspect-2/3 w-full rounded-lg" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  )
}
