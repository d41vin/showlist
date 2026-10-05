"use client"

import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Show, SignInButton, SignUpButton } from "@clerk/nextjs"
import { useAction, useConvexAuth } from "convex/react"
import { useEffect, useRef, useState } from "react"

import { AiForYou } from "@/components/ai-for-you"
import { DiscoverHero } from "@/components/discover-hero"
import { ProviderRail } from "@/components/provider-rail"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { api } from "@/convex/_generated/api"
import { mediaKey, type MediaItem } from "@/lib/media"

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
  const discoverByFilters = useAction(api.tmdb.discover)
  const genresAction = useAction(api.tmdb.genres)
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
        stateByKey={stateByKey}
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
  const [searchType, setSearchType] = useState<MediaTypeFilter>("all")

  // Browse-by-genre state (null genre = curated rows mode). Results are
  // stored keyed by their filter combo so changing filters derives the
  // loading state instead of resetting it in an effect.
  const [genre, setGenre] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState<"popularity" | "rating" | "newest">(
    "popularity"
  )
  const [genreList, setGenreList] = useState<{ id: number; name: string }[]>([])
  const [browseStore, setBrowseStore] = useState<{
    key: string
    items: MediaItem[]
    page: number
    hasMore: boolean
  } | null>(null)
  const [browseFailed, setBrowseFailed] = useState<string | null>(null)
  const [loadingMoreBrowse, setLoadingMoreBrowse] = useState(false)
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

  const browseType = mediaType === "all" ? "movie" : mediaType
  const browseKey =
    genre === null || searchActive ? null : `${browseType}:${genre}:${sortBy}`
  const currentBrowse =
    browseStore !== null && browseStore.key === browseKey ? browseStore : null
  const browseLoading =
    browseKey !== null && currentBrowse === null && browseFailed !== browseKey

  // Genre options for the selected type ("all" browses movies by default —
  // picking a genre flips the type toggle to Movies).
  useEffect(() => {
    let cancelled = false
    genresAction({ mediaType: browseType })
      .then((list) => {
        if (!cancelled) {
          setGenreList(list)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGenreList([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [browseType, genresAction])

  useEffect(() => {
    if (
      browseKey === null ||
      browseStore?.key === browseKey ||
      browseFailed === browseKey
    ) {
      return
    }
    if (genre === null) {
      return
    }
    let cancelled = false
    discoverByFilters({
      mediaType: browseType,
      genre,
      sort: sortBy,
    })
      .then((result) => {
        if (!cancelled) {
          setBrowseStore({
            key: browseKey,
            items: result.items,
            page: 1,
            hasMore: result.hasMore,
          })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBrowseFailed(browseKey)
        }
      })
    return () => {
      cancelled = true
    }
  }, [
    browseKey,
    browseStore,
    browseFailed,
    genre,
    browseType,
    sortBy,
    searchActive,
    discoverByFilters,
  ])

  const loadMoreBrowse = async () => {
    if (
      browseKey === null ||
      currentBrowse === null ||
      !currentBrowse.hasMore ||
      loadingMoreBrowse ||
      genre === null
    ) {
      return
    }
    setLoadingMoreBrowse(true)
    try {
      const result = await discoverByFilters({
        mediaType: browseType,
        genre,
        sort: sortBy,
        page: currentBrowse.page + 1,
      })
      const seen = new Set(currentBrowse.items.map(mediaKey))
      setBrowseStore({
        key: browseKey,
        items: [
          ...currentBrowse.items,
          ...result.items.filter((item) => !seen.has(mediaKey(item))),
        ],
        page: currentBrowse.page + 1,
        hasMore: result.hasMore,
      })
    } catch {
      // Keep the grid; the button stays for a retry.
    } finally {
      setLoadingMoreBrowse(false)
    }
  }

  const typeFilteredResults =
    searchResults === null
      ? null
      : searchResults.filter(
          (item) => searchType === "all" || item.mediaType === searchType
        )

  const genreSelectItems = [
    { value: "all", label: "All genres" },
    ...genreList.map((g) => ({ value: String(g.id), label: g.name })),
  ]
  const sortSelectItems = [
    { value: "popularity", label: "Most popular" },
    { value: "rating", label: "Highest rated" },
    { value: "newest", label: "Newest" },
  ]

  const GRID_CLASS =
    "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"

  const heroItem =
    !searchActive &&
    !loading &&
    !error &&
    genre === null &&
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
            <div className="mb-6 flex justify-center">
              <MediaTypeToggle value={searchType} onChange={setSearchType} />
            </div>
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
            ) : typeFilteredResults !== null &&
              typeFilteredResults.length > 0 ? (
              <div className={GRID_CLASS}>
                {typeFilteredResults.map((item) => (
                  <div key={`${item.mediaType}:${item.tmdbId}`}>
                    {renderCard(item)}
                  </div>
                ))}
              </div>
            ) : typeFilteredResults !== null &&
              searchResults !== null &&
              searchResults.length > 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                No {searchType === "movie" ? "movies" : "shows"} matched &quot;
                {trimmedQuery}&quot;.
              </p>
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

            <ProviderRail gridState={gridState} />

            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
              <TabsList>
                <TabsTrigger value="trending">Trending</TabsTrigger>
                <TabsTrigger value="popular">Popular</TabsTrigger>
                <TabsTrigger value="top-rated">Top Rated</TabsTrigger>
                <TabsTrigger value="in-theaters">In Theaters</TabsTrigger>
              </TabsList>
              <MediaTypeToggle
                value={mediaType}
                onChange={(next) => {
                  // Genre ids differ between movies and TV.
                  setGenre(null)
                  setMediaType(next)
                }}
              />
            </div>

            {/* Browse by genre; sort applies within browse mode */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Select
                items={genreSelectItems}
                value={genre === null ? "all" : String(genre)}
                onValueChange={(value) => {
                  const v = String(value)
                  if (v === "all") {
                    setGenre(null)
                    return
                  }
                  if (mediaType === "all") {
                    setMediaType("movie")
                  }
                  setGenre(Number(v))
                }}
              >
                <SelectTrigger className="w-44" aria-label="Genre">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {genreSelectItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {genre !== null && (
                <Select
                  items={sortSelectItems}
                  value={sortBy}
                  onValueChange={(value) =>
                    setSortBy(value as "popularity" | "rating" | "newest")
                  }
                >
                  <SelectTrigger className="w-40" aria-label="Sort by">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sortSelectItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-6">
              {isAuthenticated && !error && !loading && genre === null && (
                <AiForYou isAuthenticated={isAuthenticated} />
              )}
              {genre !== null ? (
                browseFailed === browseKey ? (
                  <p className="py-16 text-center text-sm text-muted-foreground">
                    Something went wrong loading results. Try again.
                  </p>
                ) : browseLoading ? (
                  <div className={GRID_CLASS}>
                    {Array.from({ length: 12 }, (_, i) => (
                      <div key={i} className="flex flex-col gap-1.5">
                        <Skeleton className="aspect-2/3 w-full rounded-lg" />
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    ))}
                  </div>
                ) : currentBrowse !== null && currentBrowse.items.length > 0 ? (
                  <>
                    <div className={GRID_CLASS}>
                      {currentBrowse.items.map((item) => (
                        <div key={`${item.mediaType}:${item.tmdbId}`}>
                          {renderCard(item)}
                        </div>
                      ))}
                    </div>
                    {currentBrowse.hasMore && (
                      <div className="flex justify-center">
                        <Button
                          variant="outline"
                          onClick={() => void loadMoreBrowse()}
                          disabled={loadingMoreBrowse}
                        >
                          {loadingMoreBrowse ? "Loading..." : "Load more"}
                        </Button>
                      </div>
                    )}
                  </>
                ) : currentBrowse !== null ? (
                  <p className="py-16 text-center text-sm text-muted-foreground">
                    Nothing found for that genre and sort — try another
                    combination.
                  </p>
                ) : null
              ) : error ? (
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
