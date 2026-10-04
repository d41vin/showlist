"use client"

import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Show, SignInButton, SignUpButton } from "@clerk/nextjs"
import { useAction, useConvexAuth } from "convex/react"
import { useEffect, useRef, useState } from "react"

import { AiForYou } from "@/components/ai-for-you"
import { DiscoverHero } from "@/components/discover-hero"
import { ShowCard } from "@/components/show-card"
import {
  useCollectionSummaries,
  useItemStateMap,
  type CardGridState,
} from "@/components/use-item-state"
import { Input } from "@/components/ui/input"
import { MediaRow } from "@/components/media-row"
import {
  MediaTypeToggle,
  type MediaTypeFilter,
} from "@/components/media-type-toggle"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { api } from "@/convex/_generated/api"
import { type MediaItem } from "@/lib/media"

const SEARCH_DEBOUNCE_MS = 400

type Category = "trending" | "popular" | "top-rated" | "in-theaters"

type RowData = {
  title: string
  items: MediaItem[]
}

export default function DiscoverPage() {
  return (
    <>
      <Show when="signed-out">
        <main className="flex min-h-[calc(100svh-3.5rem)] items-center justify-center px-6">
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <h1 className="text-4xl font-semibold tracking-tight">ShowList</h1>
            <p className="text-muted-foreground">
              Sign in to discover trending movies and TV shows, search for
              titles, and build your watchlist.
            </p>
            <div className="flex items-center gap-2">
              <SignUpButton>
                <Button>Get started</Button>
              </SignUpButton>
              <SignInButton>
                <Button variant="outline">Sign in</Button>
              </SignInButton>
            </div>
          </div>
        </main>
      </Show>
      <Show when="signed-in">
        <DiscoverContent />
      </Show>
    </>
  )
}

function DiscoverContent() {
  const { isAuthenticated } = useConvexAuth()
  const discoverTrending = useAction(api.tmdb.discoverTrending)
  const discoverPopular = useAction(api.tmdb.discoverPopular)
  const discoverTopRated = useAction(api.tmdb.discoverTopRated)
  const discoverNowPlaying = useAction(api.tmdb.discoverNowPlaying)
  const search = useAction(api.tmdb.search)

  // Card state so discovery results carry the full action overlay.
  const stateByKey = useItemStateMap(isAuthenticated)
  const collections = useCollectionSummaries(isAuthenticated)
  const [activeCardKey, setActiveCardKey] = useState<string | null>(null)
  const gridState: CardGridState = {
    stateByKey,
    collections,
    activeCardKey,
    onActiveCardKeyChange: setActiveCardKey,
  }

  const renderCard = (item: MediaItem) => {
    const key = `${item.mediaType}:${item.tmdbId}`
    return (
      <ShowCard
        item={item}
        state={stateByKey.get(key)}
        collections={collections}
        overlayOpen={activeCardKey === key}
        onOverlayOpenChange={(open) => setActiveCardKey(open ? key : null)}
      />
    )
  }

  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<Category>("trending")
  const [mediaType, setMediaType] = useState<MediaTypeFilter>("all")
  const [rows, setRows] = useState<RowData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // Search state
  const [searchResults, setSearchResults] = useState<MediaItem[] | null>(null)
  const [searchError, setSearchError] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const requestIdRef = useRef(0)
  const discoverRequestIdRef = useRef(0)

  const trimmedQuery = query.trim()
  const searchActive = trimmedQuery !== ""

  // Debounced search
  useEffect(() => {
    const requestId = ++requestIdRef.current
    if (!searchActive) {
      const timeout = setTimeout(() => {
        setSearchResults(null)
        setSearchError(false)
        setSearchLoading(false)
      }, 0)
      return () => clearTimeout(timeout)
    }
    const timeout = setTimeout(async () => {
      setSearchLoading(true)
      setSearchError(false)
      try {
        const { items } = await search({ query: trimmedQuery })
        if (requestIdRef.current === requestId) {
          setSearchResults(items)
          setSearchLoading(false)
        }
      } catch {
        if (requestIdRef.current === requestId) {
          setSearchError(true)
          setSearchLoading(false)
        }
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [trimmedQuery, searchActive, search])

  // Discovery data fetching
  useEffect(() => {
    if (searchActive) return
    const requestId = ++discoverRequestIdRef.current

    const fetchRows = async () => {
      setLoading(true)
      setError(false)
      const newRows: RowData[] = []

      try {
        if (category === "trending") {
          const items = await discoverTrending({ mediaType })
          newRows.push({ title: "Trending", items })
        } else if (category === "popular") {
          if (mediaType === "all") {
            const [movies, tv] = await Promise.all([
              discoverPopular({ mediaType: "movie" }),
              discoverPopular({ mediaType: "tv" }),
            ])
            newRows.push({ title: "Popular Movies", items: movies })
            newRows.push({ title: "Popular TV", items: tv })
          } else {
            const items = await discoverPopular({ mediaType })
            newRows.push({
              title: mediaType === "movie" ? "Popular Movies" : "Popular TV",
              items,
            })
          }
        } else if (category === "top-rated") {
          if (mediaType === "all") {
            const [movies, tv] = await Promise.all([
              discoverTopRated({ mediaType: "movie" }),
              discoverTopRated({ mediaType: "tv" }),
            ])
            newRows.push({ title: "Top Rated Movies", items: movies })
            newRows.push({ title: "Top Rated TV", items: tv })
          } else {
            const items = await discoverTopRated({ mediaType })
            newRows.push({
              title:
                mediaType === "movie" ? "Top Rated Movies" : "Top Rated TV",
              items,
            })
          }
        } else if (category === "in-theaters") {
          if (mediaType === "all") {
            const [movies, tv] = await Promise.all([
              discoverNowPlaying({ mediaType: "movie" }),
              discoverNowPlaying({ mediaType: "tv" }),
            ])
            newRows.push({ title: "Now Playing", items: movies })
            newRows.push({ title: "Airing Today", items: tv })
          } else if (mediaType === "movie") {
            const items = await discoverNowPlaying({ mediaType: "movie" })
            newRows.push({ title: "Now Playing", items })
          } else {
            const items = await discoverNowPlaying({ mediaType: "tv" })
            newRows.push({ title: "Airing Today", items })
          }
        }
      } catch {
        if (discoverRequestIdRef.current === requestId) {
          setError(true)
        }
      }

      if (discoverRequestIdRef.current === requestId) {
        setRows(newRows)
        setLoading(false)
      }
    }

    void fetchRows()
  }, [
    category,
    mediaType,
    searchActive,
    discoverTrending,
    discoverPopular,
    discoverTopRated,
    discoverNowPlaying,
  ])

  const GRID_CLASS =
    "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"

  const heroItem =
    !searchActive &&
    !loading &&
    !error &&
    category === "trending" &&
    rows[0]?.items[0] !== undefined
      ? rows[0].items[0]
      : null

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      {/* Search bar */}
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
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search movies and shows"
        />
      </div>

      <div className="mt-8">
        {searchActive ? (
          /* Search results */
          <>
            {searchLoading ? (
              <div className={GRID_CLASS}>
                {Array.from({ length: 12 }, (_, i) => (
                  <div key={i} className="flex flex-col gap-1.5">
                    <Skeleton className="aspect-2/3 w-full rounded-lg" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))}
              </div>
            ) : searchError ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Something went wrong searching. Try again.
              </p>
            ) : searchResults !== null && searchResults.length > 0 ? (
              <div className={GRID_CLASS}>
                {searchResults.map((item) => (
                  <div key={`${item.mediaType}:${item.tmdbId}`}>
                    {renderCard(item)}
                  </div>
                ))}
              </div>
            ) : searchResults !== null ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                No movies or shows found for &quot;{trimmedQuery}&quot;.
              </p>
            ) : null}
          </>
        ) : (
          /* Category tabs */
          <Tabs
            value={category}
            onValueChange={(value) => setCategory(value as Category)}
          >
            {heroItem !== null && (
              <div className="mb-8">
                <DiscoverHero item={heroItem} gridState={gridState} />
              </div>
            )}

            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
              <TabsList>
                <TabsTrigger value="trending">Trending</TabsTrigger>
                <TabsTrigger value="popular">Popular</TabsTrigger>
                <TabsTrigger value="top-rated">Top Rated</TabsTrigger>
                <TabsTrigger value="in-theaters">In Theaters</TabsTrigger>
              </TabsList>
              <MediaTypeToggle value={mediaType} onChange={setMediaType} />
            </div>

            <div className="mt-6 flex flex-col gap-6">
              {isAuthenticated && !error && !loading && (
                <AiForYou isAuthenticated={isAuthenticated} />
              )}
              {error ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  Something went wrong loading results. Try again.
                </p>
              ) : loading ? (
                <MediaRow title="" items={[]} loading renderCard={() => null} />
              ) : (
                rows.map((row) => (
                  <MediaRow
                    key={row.title}
                    title={
                      category === "trending" ? "Top 10 this week" : row.title
                    }
                    items={row.items}
                    loading={loading}
                    renderCard={renderCard}
                    ranked={category === "trending"}
                  />
                ))
              )}
            </div>
          </Tabs>
        )}
      </div>
    </main>
  )
}
