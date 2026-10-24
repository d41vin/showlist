"use client"

import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useAction, useConvexAuth } from "convex/react"
import { useEffect, useId, useState } from "react"
import { useRetainedState } from "@/components/navigation-state"
import { ShowCard } from "@/components/show-card"
import { Button } from "@/components/ui/button"
import { DrawerDescription, DrawerTitle } from "@/components/ui/drawer"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import {
  useCollectionSummaries,
  useItemStateMap,
} from "@/components/use-item-state"
import { api } from "@/convex/_generated/api"
import { mediaKey, type MediaItem } from "@/lib/media"
import { uniqueMedia } from "@/lib/search"

type Results = { items: MediaItem[]; hasMore: boolean; page: number }

export function RecommendationsView({
  item,
  variant,
  onBack,
  onClose,
}: {
  item: MediaItem
  variant: "page" | "drawer"
  onBack: () => void
  onClose?: () => void
}) {
  const { isAuthenticated } = useConvexAuth()
  const load = useAction(api.tmdb.recommendations)
  const [results, setResults] = useRetainedState<Results | null>(
    `recommendations:${mediaKey(item)}`,
    null
  )
  const [failed, setFailed] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [activeCardKey, setActiveCardKey] = useState<string | null>(null)
  const states = useItemStateMap(isAuthenticated)
  const collections = useCollectionSummaries(isAuthenticated)
  const headingId = useId()

  useEffect(() => {
    if (!isAuthenticated || results || failed) return
    let cancelled = false
    load({ mediaType: item.mediaType, tmdbId: item.tmdbId })
      .then((data) => {
        if (!cancelled) setResults({ ...data, page: 1 })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [
    isAuthenticated,
    item.mediaType,
    item.tmdbId,
    results,
    failed,
    load,
    setResults,
  ])

  const loadMore = async () => {
    if (!results?.hasMore || loadingMore) return
    setLoadingMore(true)
    setMoreFailed(false)
    try {
      const next = await load({
        mediaType: item.mediaType,
        tmdbId: item.tmdbId,
        page: results.page + 1,
      })
      setResults({
        items: uniqueMedia([...results.items, ...next.items]),
        hasMore: next.hasMore,
        page: results.page + 1,
      })
    } catch {
      setMoreFailed(true)
    } finally {
      setLoadingMore(false)
    }
  }
  const content = (
    <section
      aria-labelledby={headingId}
      className="mx-auto w-full max-w-6xl px-6 py-8"
    >
      <div
        className={`mb-6 flex flex-wrap items-center gap-2 ${
          variant === "drawer" ? "justify-between" : "justify-center"
        }`}
      >
        <Button variant="secondary" size="sm" onClick={onBack}>
          <HugeiconsIcon icon={ArrowLeft01Icon} />
          Back to title
        </Button>
        {variant === "drawer" && (
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
      {variant === "drawer" ? (
        <>
          <DrawerTitle id={headingId} className="text-2xl font-semibold">
            More like {item.title}
          </DrawerTitle>
          <DrawerDescription>
            Recommended movies and series from TMDB.
          </DrawerDescription>
        </>
      ) : (
        <h1 id={headingId} className="text-2xl font-semibold">
          More like {item.title}
        </h1>
      )}
      {failed ? (
        <div role="alert" className="space-y-4 py-8">
          <p>Couldn’t load recommendations.</p>
          <Button variant="outline" onClick={() => setFailed(false)}>
            Retry recommendations
          </Button>
        </div>
      ) : !results ? (
        <div
          role="status"
          aria-label="Loading recommendations"
          className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"
        >
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="aspect-2/3" />
          ))}
        </div>
      ) : (
        <>
          {results.items.length ? (
            <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {results.items.map((rec) => {
                const key = mediaKey(rec)
                return (
                  <ShowCard
                    key={key}
                    item={rec}
                    state={states.get(key)}
                    collections={collections}
                    overlayOpen={activeCardKey === key}
                    onOverlayOpenChange={(open) =>
                      setActiveCardKey(open ? key : null)
                    }
                  />
                )
              })}
            </div>
          ) : (
            <p className="py-12 text-center text-muted-foreground">
              No recommendations are available for this title yet.
            </p>
          )}
          {moreFailed && (
            <p
              role="alert"
              className="mt-6 text-center text-sm text-destructive"
            >
              Couldn’t load more recommendations. Your current results are still
              here.
            </p>
          )}
          {results.hasMore && (
            <div className="mt-8 flex justify-center">
              <Button
                variant="outline"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore
                  ? "Loading…"
                  : moreFailed
                    ? "Retry loading more"
                    : "Load more recommendations"}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  )
  return variant === "drawer" ? (
    <ScrollArea className="min-h-0 w-full min-w-0 flex-1">{content}</ScrollArea>
  ) : (
    content
  )
}
