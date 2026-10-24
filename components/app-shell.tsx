"use client"

import {
  ArrowLeft01Icon,
  Folder01Icon,
  ImageNotFound01Icon,
  MoreVerticalIcon,
  PencilEdit01Icon,
  PlusSignIcon,
  Delete02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useConvexAuth, useQuery } from "convex/react"
import Image from "next/image"
import { useBrowseSearchParams } from "@/components/navigation-state"
import { useMemo, useState } from "react"

import {
  DeleteCollectionDialog,
  RenameCollectionDialog,
} from "@/components/collection-admin-dialogs"
import { CreateCollectionDialog } from "@/components/create-collection-dialog"
import { ScheduleTab } from "@/components/schedule-tab"
import { ShowCard } from "@/components/show-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  MediaTypeToggle,
  type MediaTypeFilter,
} from "@/components/media-type-toggle"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { useItemStateMap } from "@/components/use-item-state"

const LIBRARY_TABS = [
  "watchlist",
  "watched",
  "watching",
  "schedule",
  "collections",
] as const

// Sort order for the library list tabs (shared across the three tabs).
type ListSort = "added" | "title" | "year"

const LIST_SORT_ITEMS: { value: ListSort; label: string }[] = [
  { value: "added", label: "Recently added" },
  { value: "title", label: "Title A–Z" },
  { value: "year", label: "Year" },
]

// The tabs the sort/type controls apply to.
const LIST_TABS = new Set(["watchlist", "watched", "watching"])

export function AppShell() {
  const { isAuthenticated } = useConvexAuth()
  const myItems = useQuery(api.items.listMine, isAuthenticated ? {} : "skip")
  const myCollections = useQuery(
    api.collections.listMine,
    isAuthenticated ? {} : "skip"
  )
  const stateByKey = useItemStateMap(isAuthenticated)
  const searchParams = useBrowseSearchParams()
  const tab =
    LIBRARY_TABS.find((value) => value === searchParams.get("tab")) ??
    "watchlist"
  const typeParam = searchParams.get("type")
  const listType: MediaTypeFilter =
    typeParam === "movie" || typeParam === "tv" ? typeParam : "all"
  const sortParam = searchParams.get("sort")
  const listSort: ListSort =
    sortParam === "title" || sortParam === "year" ? sortParam : "added"
  const filter = searchParams.get("filter") ?? ""
  const selectedCollectionId = searchParams.get("collection")
  const [createOpen, setCreateOpen] = useState(false)
  // Kebab actions on collection cards.
  const [renameTarget, setRenameTarget] = useState<{
    id: Id<"collections">
    name: string
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{
    id: Id<"collections">
    name: string
    itemCount: number
  } | null>(null)
  // Key of the card whose overlay is persistently open (one at a time).
  const [activeCardKey, setActiveCardKey] = useState<string | null>(null)

  // Native history keeps these local controls in the current entry, so
  // returning from /search restores the list without a server navigation.
  function updateListParams(
    updates: Partial<
      Record<"tab" | "type" | "sort" | "filter" | "collection", string | null>
    >
  ) {
    const url = new URL(window.location.href)
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") {
        url.searchParams.delete(key)
      } else {
        url.searchParams.set(key, value)
      }
    }
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`
    )
    setActiveCardKey(null)
  }

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
  // Never cast a URL value to a Convex ID: only a loaded, owned collection
  // may provide the ID used by CollectionGrid's query.
  const selectedCollection =
    tab === "collections"
      ? (collections.find((c) => c._id === selectedCollectionId) ?? null)
      : null
  const canFilter = LIST_TABS.has(tab) || selectedCollection !== null
  const clearFilter = () => updateListParams({ filter: null })

  const gridProps = {
    stateByKey,
    collections,
    activeCardKey,
    onActiveCardKeyChange: setActiveCardKey,
  }

  const emptyMessageFor = (base: string, items: MediaItem[]) => {
    if (filter.trim()) {
      return `No titles match "${filter.trim()}" in this list${listType === "all" ? "" : ` with the ${listType === "movie" ? "Movies" : "TV Shows"} filter`}. Try another title or clear the filter.`
    }
    return listType === "all" || items.length === 0
      ? base
      : `No ${listType === "movie" ? "movies" : "shows"} in this list.`
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <Tabs
        value={tab}
        onValueChange={(value) => {
          // Leaving/re-entering Collections lands on the cards view.
          updateListParams({ tab: String(value), collection: null })
        }}
      >
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-4">
          <div className="hide-scrollbar -mx-6 overflow-x-auto px-6 py-1 lg:mx-0 lg:overflow-visible lg:px-0 lg:py-0">
            <TabsList>
              <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
              <TabsTrigger value="watched">Watched</TabsTrigger>
              <TabsTrigger value="watching">Watching</TabsTrigger>
              <TabsTrigger value="schedule">Schedule</TabsTrigger>
              <TabsTrigger value="collections">Collections</TabsTrigger>
            </TabsList>
          </div>
          {canFilter && (
            <div className="flex w-full flex-col gap-2 lg:ml-auto lg:max-w-xs">
              <label htmlFor="list-filter" className="text-sm font-medium">
                Filter this list
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="list-filter"
                  type="text"
                  placeholder="Filter by title"
                  value={filter}
                  onChange={(event) =>
                    updateListParams({ filter: event.target.value })
                  }
                />
                {filter !== "" && (
                  <Button variant="ghost" size="sm" onClick={clearFilter}>
                    Clear
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
        {LIST_TABS.has(tab) && (
          <div className="mt-4 flex flex-wrap items-center justify-start gap-2">
            <MediaTypeToggle
              value={listType}
              onChange={(type) => updateListParams({ type })}
            />
            <Select
              items={LIST_SORT_ITEMS}
              value={listSort}
              onValueChange={(value) => updateListParams({ sort: value })}
            >
              <SelectTrigger className="w-44" aria-label="Sort order">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIST_SORT_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <TabsContent value="watchlist" className="mt-6">
          <CardGrid
            items={applyListControls(
              watchlistItems,
              listType,
              listSort,
              filter
            )}
            loading={myItems === undefined}
            emptyMessage={emptyMessageFor(
              "Nothing on your watchlist yet — use the navbar search to find something you want to watch.",
              watchlistItems
            )}
            {...gridProps}
          />
        </TabsContent>
        <TabsContent value="watched" className="mt-6">
          <CardGrid
            items={applyListControls(watchedItems, listType, listSort, filter)}
            loading={myItems === undefined}
            emptyMessage={emptyMessageFor(
              "Nothing marked as watched yet — toggle Watched on any card.",
              watchedItems
            )}
            {...gridProps}
          />
        </TabsContent>
        <TabsContent value="watching" className="mt-6">
          <CardGrid
            items={applyListControls(watchingItems, listType, listSort, filter)}
            loading={myItems === undefined}
            emptyMessage={emptyMessageFor(
              "Nothing in progress yet — toggle Watching on any card.",
              watchingItems
            )}
            {...gridProps}
          />
        </TabsContent>
        <TabsContent value="schedule" className="mt-6">
          <ScheduleTab isAuthenticated={isAuthenticated} myItems={myItems} />
        </TabsContent>
        <TabsContent value="collections" className="mt-6">
          {selectedCollection === null ? (
            <CollectionCards
              collections={collections}
              loading={myCollections === undefined}
              onOpen={(collection) => updateListParams({ collection })}
              onCreate={() => setCreateOpen(true)}
              onRename={(id, name) => setRenameTarget({ id, name })}
              onDelete={(id, name, itemCount) =>
                setDeleteTarget({ id, name, itemCount })
              }
            />
          ) : (
            <>
              <div className="mb-4 flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2 shrink-0"
                  onClick={() => updateListParams({ collection: null })}
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
                filter={filter}
                {...gridProps}
              />
            </>
          )}
        </TabsContent>
      </Tabs>

      <CreateCollectionDialog open={createOpen} onOpenChange={setCreateOpen} />
      <RenameCollectionDialog
        target={renameTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(null)
          }
        }}
      />
      <DeleteCollectionDialog
        target={deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
          }
        }}
      />
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

// Type filter + sort shared by the library list tabs. "added" keeps the
// caller's order (sortByAddedAt per tab); title sorts A–Z; year sorts
// newest first with titles as tiebreak (missing years last).
function applyListControls<T extends MediaItem>(
  items: T[],
  type: MediaTypeFilter,
  sort: ListSort,
  filter: string
): T[] {
  const titleFilter = filter.trim().toLowerCase()
  const filtered = items.filter(
    (item) =>
      (type === "all" || item.mediaType === type) &&
      item.title.toLowerCase().includes(titleFilter)
  )
  if (sort === "added") {
    return filtered
  }
  return [...filtered].sort((a, b) =>
    sort === "title"
      ? a.title.localeCompare(b.title)
      : (b.year ?? "").localeCompare(a.year ?? "") ||
        a.title.localeCompare(b.title)
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
  filter,
  ...gridProps
}: {
  collectionId: Id<"collections">
  filter: string
} & GridStateProps) {
  const { isAuthenticated } = useConvexAuth()
  const items = useQuery(
    api.collections.getItems,
    isAuthenticated ? { collectionId } : "skip"
  )
  return (
    <CardGrid
      items={applyListControls(items ?? [], "all", "added", filter)}
      loading={items === undefined}
      emptyMessage={
        filter.trim()
          ? `No titles match "${filter.trim()}" in this collection. Try another title or clear the filter.`
          : "This collection is empty — use a card's Collections button to add titles."
      }
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
  onRename,
  onDelete,
}: {
  collections: CollectionPreview[]
  loading: boolean
  onOpen: (id: Id<"collections">) => void
  onCreate: () => void
  onRename: (id: Id<"collections">, name: string) => void
  onDelete: (id: Id<"collections">, name: string, itemCount: number) => void
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
          onRename={() => onRename(collection._id, collection.name)}
          onDelete={() =>
            onDelete(collection._id, collection.name, collection.itemCount)
          }
        />
      ))}
    </div>
  )
}

function CollectionCard({
  collection,
  onOpen,
  onRename,
  onDelete,
}: {
  collection: CollectionPreview
  onOpen: () => void
  onRename: () => void
  onDelete: () => void
}) {
  return (
    <div className="group relative flex min-w-0 flex-col gap-1.5 text-left">
      <button
        type="button"
        onClick={onOpen}
        className="aspect-video w-full cursor-pointer overflow-hidden rounded-lg bg-muted transition-[filter] group-hover:brightness-90"
      >
        <CollectionMosaic posters={collection.previewPosters} />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute top-1.5 right-1.5 rounded-full bg-background/80 backdrop-blur"
              aria-label={`Options for ${collection.name}`}
            />
          }
        >
          <HugeiconsIcon icon={MoreVerticalIcon} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onRename}>
            <HugeiconsIcon icon={PencilEdit01Icon} />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <HugeiconsIcon icon={Delete02Icon} />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="min-w-0 pr-6">
        <p className="truncate text-sm font-medium">{collection.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatItemCount(collection.itemCount)}
        </p>
      </div>
    </div>
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
