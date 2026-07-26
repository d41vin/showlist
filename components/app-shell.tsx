"use client"

import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useAction, useConvexAuth, useQuery } from "convex/react"
import { useEffect, useMemo, useRef, useState } from "react"

import { ShowCard } from "@/components/show-card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "@/convex/_generated/api"
import { mediaKey, type ItemState, type MediaItem } from "@/lib/media"

const SEARCH_DEBOUNCE_MS = 400

export function AppShell() {
  const { isAuthenticated } = useConvexAuth()
  const search = useAction(api.tmdb.search)
  const myItems = useQuery(api.items.listMine, isAuthenticated ? {} : "skip")

  const [query, setQuery] = useState("")
  const [tab, setTab] = useState("watchlist")
  // Key of the card whose overlay is persistently open (one at a time).
  const [activeCardKey, setActiveCardKey] = useState<string | null>(null)
  // Results/error are tagged with the query they belong to, so "searching"
  // is derived instead of tracked — stale responses simply never match.
  const [results, setResults] = useState<{
    query: string
    items: MediaItem[]
  } | null>(null)
  const [errorQuery, setErrorQuery] = useState<string | null>(null)
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
        const items = await search({ query: trimmedQuery })
        if (requestIdRef.current === requestId) {
          setResults({ query: trimmedQuery, items })
        }
      } catch {
        if (requestIdRef.current === requestId) {
          setErrorQuery(trimmedQuery)
        }
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [trimmedQuery, searchActive, isAuthenticated, search])

  // Saved state per title, mapped onto search results and list grids.
  const stateByKey = useMemo(() => {
    const map = new Map<string, ItemState>()
    for (const item of myItems ?? []) {
      map.set(mediaKey(item), {
        inWatchlist: item.inWatchlist,
        watched: item.watched,
        sentiment: item.sentiment,
      })
    }
    return map
  }, [myItems])

  const watchlistItems = useMemo(
    () => sortRecent((myItems ?? []).filter((i) => i.inWatchlist)),
    [myItems]
  )
  const watchedItems = useMemo(
    () => sortRecent((myItems ?? []).filter((i) => i.watched)),
    [myItems]
  )

  const currentResults =
    results !== null && results.query === trimmedQuery ? results.items : null
  const currentError = errorQuery === trimmedQuery
  const searching = searchActive && currentResults === null && !currentError

  const gridProps = {
    stateByKey,
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
            results={currentResults}
            searching={searching}
            error={currentError}
            query={trimmedQuery}
            {...gridProps}
          />
        ) : (
          <Tabs
            value={tab}
            onValueChange={(value) => {
              setTab(String(value))
              setActiveCardKey(null)
            }}
          >
            <TabsList className="mx-auto">
              <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
              <TabsTrigger value="watched">Watched</TabsTrigger>
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
            <TabsContent value="collections" className="mt-6">
              {/* Collections dropdown + grids land in Session 3. */}
              <p className="py-16 text-center text-sm text-muted-foreground">
                Collections are coming next.
              </p>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </main>
  )
}

type GridStateProps = {
  stateByKey: Map<string, ItemState>
  activeCardKey: string | null
  onActiveCardKeyChange: (key: string | null) => void
}

function sortRecent<T extends { updatedAt: number }>(items: T[]) {
  return items.sort((a, b) => b.updatedAt - a.updatedAt)
}

function CardGrid({
  items,
  loading,
  emptyMessage,
  stateByKey,
  activeCardKey,
  onActiveCardKeyChange,
}: {
  items: MediaItem[]
  loading?: boolean
  emptyMessage: string
} & GridStateProps) {
  if (loading) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Loading…
      </p>
    )
  }
  if (items.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((item) => {
        const key = mediaKey(item)
        return (
          <ShowCard
            key={key}
            item={item}
            state={stateByKey.get(key)}
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

function SearchResults({
  results,
  searching,
  error,
  query,
  ...gridProps
}: {
  results: MediaItem[] | null
  searching: boolean
  error: boolean
  query: string
} & GridStateProps) {
  if (searching) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Searching…
      </p>
    )
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
    <CardGrid
      items={results}
      emptyMessage={`No movies or shows found for "${query}".`}
      {...gridProps}
    />
  )
}
