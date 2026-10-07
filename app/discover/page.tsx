"use client"

import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Show, SignInButton, SignUpButton } from "@clerk/nextjs"
import { useAction, useConvexAuth } from "convex/react"
import { useEffect, useMemo, useRef, useState } from "react"

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

// One merged genre option — the union of the movie and TV genre lists by
// name. TMDB genre ids differ per type (and some names exist on only one
// side), so each option carries the id it maps to per type.
type GenreOption = {
  value: string
  label: string
  movieId: number | null
  tvId: number | null
}

// Per-type browse state: one page cursor + accumulation per media type, so
// the merged ("all") grid can load more from both discover queries.
type BrowseList = { items: MediaItem[]; page: number; hasMore: boolean }
type BrowseStore = {
  key: string
  lists: Partial<Record<"movie" | "tv", BrowseList>>
}

// Zip two ranked lists into one merged grid — movie, tv, movie, tv, …
function interleave(a: MediaItem[], b: MediaItem[]): MediaItem[] {
  const out: MediaItem[] = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) {
      out.push(a[i])
    }
    if (i < b.length) {
      out.push(b[i])
    }
  }
  return out
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
  // loading state instead of resetting it in an effect. With type "all" a
  // picked genre runs both per-type discover queries into one grid.
  const [genreName, setGenreName] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<"popularity" | "rating" | "newest">(
    "popularity"
  )
  const [genreOptions, setGenreOptions] = useState<GenreOption[]>([])
  const [browseStore, setBrowseStore] = useState<BrowseStore | null>(null)
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

  const browseKey =
    genreName === null || searchActive
      ? null
      : `${mediaType}:${genreName}:${sortBy}`
  const currentBrowse =
    browseStore !== null && browseStore.key === browseKey ? browseStore : null
  const browseLoading =
    browseKey !== null && currentBrowse === null && browseFailed !== browseKey

  // The grid's items: interleaved movie+TV in merged mode, the single type's
  // list otherwise.
  const browseItems = useMemo(() => {
    if (currentBrowse === null) {
      return null
    }
    if (mediaType === "all") {
      return interleave(
        currentBrowse.lists.movie?.items ?? [],
        currentBrowse.lists.tv?.items ?? []
      )
    }
    return currentBrowse.lists[mediaType]?.items ?? []
  }, [currentBrowse, mediaType])
  const browseHasMore =
    currentBrowse !== null &&
    Object.values(currentBrowse.lists).some((s) => s?.hasMore ?? false)

  // Genre options for the selected type; "all" merges both TMDB genre lists
  // by name so one browse grid can interleave the two discover queries.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        if (mediaType === "all") {
          const [movies, tv] = await Promise.all([
            genresAction({ mediaType: "movie" }),
            genresAction({ mediaType: "tv" }),
          ])
          const byName = new Map<string, GenreOption>()
          for (const g of movies) {
            byName.set(g.name, {
              value: g.name,
              label: g.name,
              movieId: g.id,
              tvId: null,
            })
          }
          for (const g of tv) {
            const existing = byName.get(g.name)
            if (existing !== undefined) {
              existing.tvId = g.id
            } else {
              byName.set(g.name, {
                value: g.name,
                label: g.name,
                movieId: null,
                tvId: g.id,
              })
            }
          }
          if (!cancelled) {
            setGenreOptions([...byName.values()])
          }
        } else {
          const list = await genresAction({ mediaType })
          if (!cancelled) {
            setGenreOptions(
              list.map((g) => ({
                value: g.name,
                label: g.name,
                movieId: mediaType === "movie" ? g.id : null,
                tvId: mediaType === "tv" ? g.id : null,
              }))
            )
          }
        }
      } catch {
        if (!cancelled) {
          setGenreOptions([])
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [mediaType, genresAction])

  useEffect(() => {
    if (
      browseKey === null ||
      browseStore?.key === browseKey ||
      browseFailed === browseKey
    ) {
      return
    }
    if (genreName === null) {
      return
    }
    const option = genreOptions.find((g) => g.value === genreName)
    if (option === undefined) {
      return
    }
    // Genre ids differ per type; in merged mode only the types that have
    // this genre get queried.
    const targets = [
      ...(option.movieId !== null
        ? [{ type: "movie" as const, id: option.movieId }]
        : []),
      ...(option.tvId !== null
        ? [{ type: "tv" as const, id: option.tvId }]
        : []),
    ]
    let cancelled = false
    const load = async () => {
      try {
        const results = await Promise.all(
          targets.map(({ type, id }) =>
            discoverByFilters({ mediaType: type, genre: id, sort: sortBy })
          )
        )
        const lists: BrowseStore["lists"] = {}
        targets.forEach(({ type }, i) => {
          lists[type] = {
            items: results[i].items,
            page: 1,
            hasMore: results[i].hasMore,
          }
        })
        if (!cancelled) {
          setBrowseStore({ key: browseKey, lists })
        }
      } catch {
        if (!cancelled) {
          setBrowseFailed(browseKey)
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [
    browseKey,
    browseStore,
    browseFailed,
    genreName,
    genreOptions,
    sortBy,
    searchActive,
    discoverByFilters,
  ])

  const loadMoreBrowse = async () => {
    if (
      browseKey === null ||
      currentBrowse === null ||
      loadingMoreBrowse ||
      genreName === null
    ) {
      return
    }
    const option = genreOptions.find((g) => g.value === genreName)
    if (option === undefined) {
      return
    }
    const extendTypes =
      mediaType === "all"
        ? (["movie", "tv"] as const).filter(
            (t) => currentBrowse.lists[t]?.hasMore ?? false
          )
        : currentBrowse.lists[mediaType]?.hasMore
          ? [mediaType]
          : []
    if (extendTypes.length === 0) {
      return
    }
    setLoadingMoreBrowse(true)
    try {
      const lists: BrowseStore["lists"] = { ...currentBrowse.lists }
      for (const type of extendTypes) {
        const id = type === "movie" ? option.movieId : option.tvId
        const state = currentBrowse.lists[type]
        if (id === null || state === undefined) {
          continue
        }
        const result = await discoverByFilters({
          mediaType: type,
          genre: id,
          sort: sortBy,
          page: state.page + 1,
        })
        const seen = new Set(state.items.map(mediaKey))
        lists[type] = {
          items: [
            ...state.items,
            ...result.items.filter((item) => !seen.has(mediaKey(item))),
          ],
          page: state.page + 1,
          hasMore: result.hasMore,
        }
      }
      setBrowseStore({ key: browseKey, lists })
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
    ...genreOptions.map((g) => ({ value: g.value, label: g.label })),
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
    genreName === null &&
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
                  setGenreName(null)
                  setMediaType(next)
                }}
              />
            </div>

            {/* Browse by genre; sort applies within browse mode */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Select
                items={genreSelectItems}
                value={genreName === null ? "all" : genreName}
                onValueChange={(value) => {
                  const v = String(value)
                  // In merged ("all") mode the grid interleaves both types'
                  // queries for the picked genre — no auto-flip to Movies.
                  setGenreName(v === "all" ? null : v)
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
              {genreName !== null && (
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
              {isAuthenticated && !error && !loading && genreName === null && (
                <AiForYou isAuthenticated={isAuthenticated} />
              )}
              {genreName !== null ? (
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
                ) : browseItems !== null && browseItems.length > 0 ? (
                  <>
                    <div className={GRID_CLASS}>
                      {browseItems.map((item) => (
                        <div key={`${item.mediaType}:${item.tmdbId}`}>
                          {renderCard(item)}
                        </div>
                      ))}
                    </div>
                    {browseHasMore && (
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
                ) : browseItems !== null ? (
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
