"use client"

import { Show, SignInButton, SignUpButton } from "@clerk/nextjs"
import { useAction, useConvexAuth } from "convex/react"
import {
  useBrowseSearchParams,
  useRetainedState,
} from "@/components/navigation-state"
import { Suspense, useEffect, useMemo, useRef, useState } from "react"

import { AiForYou } from "@/components/ai-for-you"
import { DiscoverHero } from "@/components/discover-hero"
import { ProviderRail } from "@/components/provider-rail"
import { RailScroller } from "@/components/rail-scroller"
import { ShowCard } from "@/components/show-card"
import {
  useCollectionSummaries,
  useItemStateMap,
  type CardGridState,
} from "@/components/use-item-state"
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
import { Button } from "@/components/ui/button"
import { api } from "@/convex/_generated/api"
import { useAiConfig } from "@/lib/ai"
import { mediaKey, type MediaItem } from "@/lib/media"

type DiscoverSort = "popularity" | "rating" | "newest"

type RowData = {
  title: string
  items: MediaItem[]
  // Top-10 treatment: big rank numerals overlaid on the first ten posters.
  ranked?: boolean
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
              Sign in to discover trending movies and series, search for titles,
              and build your watchlist.
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
        <Suspense
          fallback={
            <p className="px-6 py-8 text-sm text-muted-foreground">
              Loading discover...
            </p>
          }
        >
          <DiscoverContent />
        </Suspense>
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

  const searchParams = useBrowseSearchParams()
  const typeParam = searchParams.get("type")
  const mediaType: MediaTypeFilter =
    typeParam === "movie" || typeParam === "tv" ? typeParam : "all"
  const sortParam = searchParams.get("sort")
  const sortBy: DiscoverSort =
    sortParam === "rating" || sortParam === "newest" ? sortParam : "popularity"
  const requestedGenre = searchParams.get("genre") || null
  const [curatedAttempt, setCuratedAttempt] = useState(0)
  const curatedKey = `${mediaType}:${curatedAttempt}`
  const [curatedStore, setCuratedStore] = useRetainedState<{
    key: string
    rows: RowData[]
    error: boolean
  } | null>("discover:curated", null)
  const currentCurated =
    isAuthenticated && curatedStore?.key === curatedKey ? curatedStore : null
  const rows = currentCurated?.rows ?? []
  const loading = currentCurated === null
  const error = currentCurated?.error ?? false

  // Results and genre options are keyed by their controls so stale data
  // cannot flash while URL state is restored or the selected type changes.
  const [genreAttempt, setGenreAttempt] = useState(0)
  const genreKey = `${mediaType}:${genreAttempt}`
  const [genreStore, setGenreStore] = useRetainedState<{
    key: string
    options: GenreOption[]
    error: boolean
  } | null>("discover:genres", null)
  const currentGenres =
    isAuthenticated && genreStore?.key === genreKey ? genreStore : null
  const genreOptions = useMemo(
    () => currentGenres?.options ?? [],
    [currentGenres]
  )
  const genreError = currentGenres?.error ?? false
  const genreName =
    currentGenres !== null && !genreError
      ? (genreOptions.find((option) => option.value === requestedGenre)
          ?.value ?? null)
      : requestedGenre
  const [browseStore, setBrowseStore] = useRetainedState<BrowseStore | null>(
    "discover:browse",
    null
  )
  const [browseFailed, setBrowseFailed] = useState<string | null>(null)
  const [loadingMoreRequest, setLoadingMoreRequest] = useState<{
    key: string
    id: number
  } | null>(null)
  const browseRequestIdRef = useRef(0)

  function updateDiscoverParams(
    updates: Partial<Record<"type" | "genre" | "sort", string | null>>
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
    setLoadingMoreRequest(null)
  }

  // AI features stay hidden until the user has configured a key — the
  // header popover's AI settings entry is the only always-visible door.
  const aiConfigured = useAiConfig() !== null

  // Load the existing curated shelves; cleanup discards late responses on
  // type changes, auth loss, retry, and navigation away from this page.
  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false

    const fetchRows = async () => {
      const newRows: RowData[] = []

      try {
        newRows.push({
          title: "Top 10 this week",
          items: await discoverTrending({ mediaType }),
          ranked: true,
        })
        if (cancelled) return
        const types: ("movie" | "tv")[] =
          mediaType === "all" ? ["movie", "tv"] : [mediaType]
        const popular = await Promise.all(
          types.map((type) => discoverPopular({ mediaType: type }))
        )
        if (cancelled) return
        popular.forEach((items, i) =>
          newRows.push({
            title: types[i] === "movie" ? "Popular Movies" : "Popular Series",
            items,
          })
        )
        const top = await Promise.all(
          types.map((type) => discoverTopRated({ mediaType: type }))
        )
        if (cancelled) return
        top.forEach((items, i) =>
          newRows.push({
            title:
              types[i] === "movie" ? "Top Rated Movies" : "Top Rated Series",
            items,
          })
        )
        const now = await Promise.all(
          types.map((type) => discoverNowPlaying({ mediaType: type }))
        )
        now.forEach((items, i) =>
          newRows.push({
            title: types[i] === "movie" ? "Now Playing" : "Airing Today",
            items,
          })
        )
      } catch {
        if (!cancelled) {
          setCuratedStore({ key: curatedKey, rows: newRows, error: true })
        }
        return
      }

      if (!cancelled) {
        setCuratedStore({ key: curatedKey, rows: newRows, error: false })
      }
    }

    void fetchRows()
    return () => {
      cancelled = true
    }
  }, [
    isAuthenticated,
    mediaType,
    curatedKey,
    discoverTrending,
    discoverPopular,
    discoverTopRated,
    discoverNowPlaying,
    setCuratedStore,
  ])

  const browseKey =
    genreName === null ? null : `${mediaType}:${genreName}:${sortBy}`
  const currentBrowse =
    isAuthenticated && browseStore !== null && browseStore.key === browseKey
      ? browseStore
      : null
  const browseLoading =
    browseKey !== null && currentBrowse === null && browseFailed !== browseKey
  const loadingMoreBrowse = loadingMoreRequest?.key === browseKey

  // Pagination must also ignore results after a filter/auth change or unmount.
  useEffect(() => {
    return () => {
      browseRequestIdRef.current += 1
    }
  }, [browseKey, isAuthenticated])

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
    if (!isAuthenticated) return
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
            setGenreStore({
              key: genreKey,
              options: [...byName.values()],
              error: false,
            })
          }
        } else {
          const list = await genresAction({ mediaType })
          if (!cancelled) {
            setGenreStore({
              key: genreKey,
              options: list.map((g) => ({
                value: g.name,
                label: g.name,
                movieId: mediaType === "movie" ? g.id : null,
                tvId: mediaType === "tv" ? g.id : null,
              })),
              error: false,
            })
          }
        }
      } catch {
        if (!cancelled) {
          setGenreStore({ key: genreKey, options: [], error: true })
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, mediaType, genreKey, genresAction, setGenreStore])

  useEffect(() => {
    if (
      !isAuthenticated ||
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
    isAuthenticated,
    discoverByFilters,
    setBrowseStore,
  ])

  const loadMoreBrowse = async () => {
    if (
      !isAuthenticated ||
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
    const requestId = ++browseRequestIdRef.current
    setLoadingMoreRequest({ key: browseKey, id: requestId })
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
        if (browseRequestIdRef.current !== requestId) return
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
      if (browseRequestIdRef.current === requestId) {
        setBrowseStore({ key: browseKey, lists })
      }
    } catch {
      // Keep the grid; the button stays for a retry.
    } finally {
      setLoadingMoreRequest((current) =>
        current?.id === requestId ? null : current
      )
    }
  }

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

  const heroItems =
    !loading && !error && genreName === null
      ? (rows[0]?.items ?? []).slice(0, 5)
      : []

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      {heroItems.length > 0 && (
        <div className="mb-8">
          {/* Billboard strip: the top five trending titles as
              full-width hero pages — swipe on touch, chevrons on
              desktop, snap-locked. */}
          <RailScroller
            className="snap-x snap-mandatory"
            autoAdvanceMs={8000}
            paged
            loop
          >
            {heroItems.map((item, index) => (
              <div
                key={`${item.mediaType}:${item.tmdbId}`}
                className="w-full shrink-0 snap-start"
              >
                <DiscoverHero
                  item={item}
                  gridState={gridState}
                  priority={index === 0}
                />
              </div>
            ))}
          </RailScroller>
        </div>
      )}

      {isAuthenticated && <ProviderRail gridState={gridState} />}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
        <MediaTypeToggle
          value={mediaType}
          onChange={(next) => {
            // Genre ids differ between movies and TV.
            updateDiscoverParams({ type: next, genre: null })
          }}
        />
        <Select
          items={genreSelectItems}
          value={
            currentGenres === null || genreError ? "all" : (genreName ?? "all")
          }
          disabled={currentGenres === null || genreError}
          onValueChange={(value) => {
            const v = String(value)
            // In merged ("all") mode the grid interleaves both types'
            // queries for the picked genre — no auto-flip to Movies.
            updateDiscoverParams({ genre: v === "all" ? null : v })
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
            onValueChange={(value) => updateDiscoverParams({ sort: value })}
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
      {genreError && (
        <div className="mt-6 flex flex-col items-center gap-3 text-sm text-muted-foreground">
          <p>Something went wrong loading genres.</p>
          <Button
            variant="outline"
            disabled={!isAuthenticated}
            onClick={() => setGenreAttempt((attempt) => attempt + 1)}
          >
            Retry
          </Button>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-8">
        {isAuthenticated &&
          aiConfigured &&
          !error &&
          !loading &&
          genreName === null && <AiForYou isAuthenticated={isAuthenticated} />}
        {genreName !== null ? (
          genreError ? null : browseFailed === browseKey ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
              <p>Something went wrong loading results.</p>
              <Button
                variant="outline"
                disabled={!isAuthenticated}
                onClick={() => setBrowseFailed(null)}
              >
                Retry
              </Button>
            </div>
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
              Nothing found for that genre and sort — try another combination.
            </p>
          ) : null
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
            <p>Something went wrong loading results.</p>
            <Button
              variant="outline"
              disabled={!isAuthenticated}
              onClick={() => setCuratedAttempt((attempt) => attempt + 1)}
            >
              Retry
            </Button>
          </div>
        ) : loading ? (
          <>
            <MediaRow title="" items={[]} loading renderCard={() => null} />
            <MediaRow title="" items={[]} loading renderCard={() => null} />
            <MediaRow title="" items={[]} loading renderCard={() => null} />
          </>
        ) : (
          rows.map((row) => (
            <MediaRow
              key={row.title}
              title={row.title}
              items={row.items}
              loading={loading}
              renderCard={renderCard}
              ranked={row.ranked === true}
            />
          ))
        )}
      </div>
    </main>
  )
}
