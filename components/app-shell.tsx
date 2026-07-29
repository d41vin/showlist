"use client"

import {
  ArrowLeft01Icon,
  Folder01Icon,
  ImageNotFound01Icon,
  PlusSignIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useAction, useConvexAuth, useQuery } from "convex/react"
import Image from "next/image"
import { useEffect, useMemo, useRef, useState } from "react"

import { CreateCollectionDialog } from "@/components/create-collection-dialog"
import { ShowCard } from "@/components/show-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "@/convex/_generated/api"
import { type Id } from "@/convex/_generated/dataModel"
import {
  mediaKey,
  tmdbPosterUrl,
  type CollectionPreview,
  type CollectionSummary,
  type ItemState,
  type MediaItem,
} from "@/lib/media"
import { cn } from "@/lib/utils"

const SEARCH_DEBOUNCE_MS = 400

export function AppShell() {
  const { isAuthenticated } = useConvexAuth()
  const search = useAction(api.tmdb.search)
  const myItems = useQuery(api.items.listMine, isAuthenticated ? {} : "skip")
  const myCollections = useQuery(
    api.collections.listMine,
    isAuthenticated ? {} : "skip"
  )
  const memberships = useQuery(
    api.collections.listMemberships,
    isAuthenticated ? {} : "skip"
  )

  const [query, setQuery] = useState("")
  const [tab, setTab] = useState("watchlist")
  // Which collection the Collections tab is showing (null = cards view;
  // reset whenever the tab changes so re-entering shows the cards again).
  const [selectedCollectionId, setSelectedCollectionId] =
    useState<Id<"collections"> | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  // Key of the card whose overlay is persistently open (one at a time).
  const [activeCardKey, setActiveCardKey] = useState<string | null>(null)
  // Results/error are tagged with the query they belong to, so "searching"
  // is derived instead of tracked — stale responses simply never match.
  const [results, setResults] = useState<{
    query: string
    items: MediaItem[]
    page: number
    hasMore: boolean
  } | null>(null)
  const [errorQuery, setErrorQuery] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  // Guards against out-of-order responses from overlapping searches.
  const requestIdRef = useRef(0)

  const trimmedQuery = query.trim()
  const searchActive = trimmedQuery !== ""

  useEffect(() => {
    const requestId = ++requestIdRef.current
    if (!searchActive || !isAuthenticated) {
      return
    }
    const timeout = setTimeout(async () => {
      try {
        const { items, hasMore } = await search({ query: trimmedQuery })
        if (requestIdRef.current === requestId) {
          setResults({ query: trimmedQuery, items, page: 1, hasMore })
        }
      } catch {
        if (requestIdRef.current === requestId) {
          setErrorQuery(trimmedQuery)
        }
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [trimmedQuery, searchActive, isAuthenticated, search])

  // Appends the next TMDB page to the current results. Failures keep the
  // grid and button intact so the user can simply try again.
  const loadMore = async () => {
    if (results === null || !results.hasMore || loadingMore) {
      return
    }
    const requestId = requestIdRef.current
    const nextPage = results.page + 1
    setLoadingMore(true)
    try {
      const { items, hasMore } = await search({
        query: results.query,
        page: nextPage,
      })
      if (requestIdRef.current === requestId) {
        setResults((prev) => {
          if (prev === null || prev.query !== results.query) {
            return prev
          }
          // TMDB pages can shift between requests; drop duplicate titles.
          const seen = new Set(prev.items.map(mediaKey))
          return {
            ...prev,
            items: [
              ...prev.items,
              ...items.filter((item) => !seen.has(mediaKey(item))),
            ],
            page: nextPage,
            hasMore,
          }
        })
      }
    } catch {
      // Ignored — see comment above.
    } finally {
      setLoadingMore(false)
    }
  }

  // Saved state per title, mapped onto search results and list grids.
  const stateByKey = useMemo(() => {
    const idsByItem = new Map<Id<"items">, Set<Id<"collections">>>()
    for (const membership of memberships ?? []) {
      const ids = idsByItem.get(membership.itemId) ?? new Set()
      ids.add(membership.collectionId)
      idsByItem.set(membership.itemId, ids)
    }
    const map = new Map<string, ItemState>()
    for (const item of myItems ?? []) {
      map.set(mediaKey(item), {
        itemId: item._id,
        inWatchlist: item.inWatchlist,
        watching: item.watching ?? false,
        watched: item.watched,
        sentiment: item.sentiment,
        collectionIds: idsByItem.get(item._id) ?? new Set(),
      })
    }
    return map
  }, [myItems, memberships])

  const watchlistItems = useMemo(
    () =>
      sortByAddedAt(
        (myItems ?? []).filter((i) => i.inWatchlist),
        (i) => i.watchlistAt
      ),
    [myItems]
  )
  const watchingItems = useMemo(
    () =>
      sortByAddedAt(
        (myItems ?? []).filter((i) => i.watching === true),
        (i) => i.watchingAt
      ),
    [myItems]
  )
  const watchedItems = useMemo(
    () =>
      sortByAddedAt(
        (myItems ?? []).filter((i) => i.watched),
        (i) => i.watchedAt
      ),
    [myItems]
  )
  const collections = useMemo(
    () =>
      [...(myCollections ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [myCollections]
  )
  const selectedCollection =
    collections.find((c) => c._id === selectedCollectionId) ?? null

  const currentResults =
    results !== null && results.query === trimmedQuery ? results : null
  const currentError = errorQuery === trimmedQuery
  const searching = searchActive && currentResults === null && !currentError

  const gridProps = {
    stateByKey,
    collections,
    activeCardKey,
    onActiveCardKeyChange: setActiveCardKey,
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="relative mx-auto w-full max-w-xl">
        <HugeiconsIcon
          icon={Search01Icon}
          className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          placeholder="Search movies and shows..."
          className="pl-9"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActiveCardKey(null)
          }}
          aria-label="Search movies and shows"
        />
      </div>

      <div className="mt-8">
        {searchActive ? (
          <SearchResults
            results={currentResults?.items ?? null}
            searching={searching}
            error={currentError}
            query={trimmedQuery}
            hasMore={currentResults?.hasMore ?? false}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
            {...gridProps}
          />
        ) : (
          <Tabs
            value={tab}
            onValueChange={(value) => {
              setTab(String(value))
              setActiveCardKey(null)
              // Leaving/re-entering Collections always lands on the cards view.
              setSelectedCollectionId(null)
            }}
          >
            <TabsList className="mx-auto">
              <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
              <TabsTrigger value="watched">Watched</TabsTrigger>
              <TabsTrigger value="watching">Watching</TabsTrigger>
              <TabsTrigger value="collections">Collections</TabsTrigger>
            </TabsList>
            <TabsContent value="watchlist" className="mt-6">
              <CardGrid
                items={watchlistItems}
                loading={myItems === undefined}
                emptyMessage="Nothing on your watchlist yet — search for something you want to watch."
                {...gridProps}
              />
            </TabsContent>
            <TabsContent value="watched" className="mt-6">
              <CardGrid
                items={watchedItems}
                loading={myItems === undefined}
                emptyMessage="Nothing marked as watched yet — toggle Watched on any card."
                {...gridProps}
              />
            </TabsContent>
            <TabsContent value="watching" className="mt-6">
              <CardGrid
                items={watchingItems}
                loading={myItems === undefined}
                emptyMessage="Nothing in progress yet — toggle Watching on any card."
                {...gridProps}
              />
            </TabsContent>
            <TabsContent value="collections" className="mt-6">
              {selectedCollection === null ? (
                <CollectionCards
                  collections={collections}
                  loading={myCollections === undefined}
                  onOpen={setSelectedCollectionId}
                  onCreate={() => setCreateOpen(true)}
                />
              ) : (
                <>
                  <div className="mb-4 flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-2 shrink-0"
                      onClick={() => setSelectedCollectionId(null)}
                    >
                      <HugeiconsIcon icon={ArrowLeft01Icon} />
                      Back
                    </Button>
                    <h2 className="min-w-0 truncate text-sm font-medium">
                      {selectedCollection.name}
                    </h2>
                    <span className="shrink-0 text-sm text-muted-foreground">
                      {formatItemCount(selectedCollection.itemCount)}
                    </span>
                  </div>
                  <CollectionGrid
                    collectionId={selectedCollection._id}
                    {...gridProps}
                  />
                </>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <CreateCollectionDialog open={createOpen} onOpenChange={setCreateOpen} />
    </main>
  )
}

type GridStateProps = {
  stateByKey: Map<string, ItemState>
  collections: CollectionSummary[]
  activeCardKey: string | null
  onActiveCardKeyChange: (key: string | null) => void
}

// Most recently added to the given status first. The per-status timestamp
// wins; docs from before those fields existed fall back to doc creation
// time. Toggling other statuses never reorders a tab.
function sortByAddedAt<T extends { _creationTime: number }>(
  items: T[],
  addedAt: (item: T) => number | undefined
) {
  return items.sort(
    (a, b) => (addedAt(b) ?? b._creationTime) - (addedAt(a) ?? a._creationTime)
  )
}

const GRID_CLASS =
  "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"

function GridSkeleton() {
  return (
    <div className={GRID_CLASS}>
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Skeleton className="aspect-2/3 w-full rounded-lg" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}

function CardGrid({
  items,
  loading,
  emptyMessage,
  stateByKey,
  collections,
  activeCardKey,
  onActiveCardKeyChange,
}: {
  items: MediaItem[]
  loading?: boolean
  emptyMessage: string
} & GridStateProps) {
  if (loading) {
    return <GridSkeleton />
  }
  if (items.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    )
  }
  return (
    <div className={GRID_CLASS}>
      {items.map((item) => {
        const key = mediaKey(item)
        return (
          <ShowCard
            key={key}
            item={item}
            state={stateByKey.get(key)}
            collections={collections}
            overlayOpen={activeCardKey === key}
            onOverlayOpenChange={(open) =>
              onActiveCardKeyChange(open ? key : null)
            }
          />
        )
      })}
    </div>
  )
}

function CollectionGrid({
  collectionId,
  ...gridProps
}: {
  collectionId: Id<"collections">
} & GridStateProps) {
  const { isAuthenticated } = useConvexAuth()
  const items = useQuery(
    api.collections.getItems,
    isAuthenticated ? { collectionId } : "skip"
  )
  return (
    <CardGrid
      items={items ?? []}
      loading={items === undefined}
      emptyMessage="This collection is empty — use a card's Collections button to add titles."
      {...gridProps}
    />
  )
}

// Landscape collection cards, wider than the 2:3 poster cards on purpose.
const COLLECTION_GRID_CLASS =
  "grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3"

function formatItemCount(count: number) {
  return `${count} ${count === 1 ? "item" : "items"}`
}

function CollectionCards({
  collections,
  loading,
  onOpen,
  onCreate,
}: {
  collections: CollectionPreview[]
  loading: boolean
  onOpen: (id: Id<"collections">) => void
  onCreate: () => void
}) {
  if (loading) {
    return (
      <div className={COLLECTION_GRID_CLASS}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="aspect-video w-full rounded-lg" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className={COLLECTION_GRID_CLASS}>
      {/* The first cell is always the create card. */}
      <button
        type="button"
        onClick={onCreate}
        className="group flex flex-col gap-1.5 text-left"
      >
        <div className="flex aspect-video w-full items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground transition-colors group-hover:bg-muted/50 group-hover:text-foreground">
          <HugeiconsIcon icon={PlusSignIcon} className="size-5" />
          <span className="text-sm font-medium">Create</span>
        </div>
      </button>
      {collections.map((collection) => (
        <CollectionCard
          key={collection._id}
          collection={collection}
          onOpen={() => onOpen(collection._id)}
        />
      ))}
    </div>
  )
}

function CollectionCard({
  collection,
  onOpen,
}: {
  collection: CollectionPreview
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex min-w-0 cursor-pointer flex-col gap-1.5 text-left"
    >
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-muted transition-[filter] group-hover:brightness-90">
        <CollectionMosaic posters={collection.previewPosters} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{collection.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatItemCount(collection.itemCount)}
        </p>
      </div>
    </button>
  )
}

// Poster mosaic for a collection card: each tile is a centered window onto
// the poster (cover crop). Layout depends on how many posters there are:
// 1 fills the card, 2 sit side by side, 3 = full-height left + stacked
// right, 4 is a 2x2 grid. Empty collections show a folder face instead.
function CollectionMosaic({ posters }: { posters: (string | null)[] }) {
  const tiles = posters.slice(0, 4)
  if (tiles.length === 0) {
    return (
      <div className="flex size-full items-center justify-center text-muted-foreground">
        <HugeiconsIcon icon={Folder01Icon} className="size-8" />
      </div>
    )
  }
  if (tiles.length === 1) {
    return <MosaicTile posterPath={tiles[0]} className="size-full" />
  }
  if (tiles.length === 2) {
    return (
      <div className="grid size-full grid-cols-2 gap-0.5">
        {tiles.map((posterPath, i) => (
          <MosaicTile key={i} posterPath={posterPath} />
        ))}
      </div>
    )
  }
  return (
    <div className="grid size-full grid-cols-2 grid-rows-2 gap-0.5">
      {tiles.map((posterPath, i) => (
        <MosaicTile
          key={i}
          posterPath={posterPath}
          className={tiles.length === 3 && i === 0 ? "row-span-2" : undefined}
        />
      ))}
    </div>
  )
}

function MosaicTile({
  posterPath,
  className,
}: {
  posterPath: string | null
  className?: string
}) {
  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      {posterPath ? (
        <Image
          src={tmdbPosterUrl(posterPath)}
          alt=""
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <HugeiconsIcon icon={ImageNotFound01Icon} className="size-6" />
        </div>
      )}
    </div>
  )
}

function SearchResults({
  results,
  searching,
  error,
  query,
  hasMore,
  loadingMore,
  onLoadMore,
  ...gridProps
}: {
  results: MediaItem[] | null
  searching: boolean
  error: boolean
  query: string
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
} & GridStateProps) {
  if (searching) {
    return <GridSkeleton />
  }
  if (error) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Something went wrong searching. Try again.
      </p>
    )
  }
  if (results === null) {
    return null
  }
  return (
    <>
      <CardGrid
        items={results}
        emptyMessage={`No movies or shows found for "${query}".`}
        {...gridProps}
      />
      {results.length > 0 && hasMore && (
        <div className="mt-8 flex justify-center">
          <Button variant="outline" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </>
  )
}
