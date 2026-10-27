"use client"

import { useConvexAuth, useQuery } from "convex/react"
import { useSearchParams } from "next/navigation"
import { useState } from "react"
import {
  AiMagicIcon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { AiDescribe } from "@/components/ai-describe"
import { LibraryCard } from "@/components/library-card"
import { useNavigationState } from "@/components/navigation-state"
import { MediaTypeToggle } from "@/components/media-type-toggle"
import { OptionGroup, type OptionGroupOption } from "@/components/option-group"
import { ShowCard } from "@/components/show-card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  useCollectionSummaries,
  useItemStateMap,
  type CardGridState,
} from "@/components/use-item-state"
import { api } from "@/convex/_generated/api"
import { useAiConfig } from "@/lib/ai"
import { clearEntitySearch, readEntitySearch } from "@/lib/entity-search"
import { mediaKey, type MediaItem } from "@/lib/media"
import { replaceSearchUrl } from "@/lib/navigation"
import {
  defaultSortOrder,
  savedLabels,
  searchLibrary,
  type EntitySort,
  type SearchSort,
  type SearchStatus,
  type SearchSentiment,
  type SortOrder,
  type TitleSort,
} from "@/lib/search"
import { cn } from "@/lib/utils"

const GRID_CLASS =
  "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"

const LIBRARY_GRID_CLASS =
  "grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 xl:grid-cols-3"

const TEXT_SORTS: { value: TitleSort; label: string }[] = [
  { value: "relevance", label: "Best match" },
  { value: "popularity", label: "Popularity" },
  { value: "newest", label: "Release date" },
  { value: "rating", label: "Rating" },
  { value: "title", label: "Title" },
]

const ENTITY_SORTS: { value: EntitySort; label: string }[] = [
  { value: "popularity", label: "Popularity" },
  { value: "newest", label: "Release date" },
]

const SEARCH_SCOPE_OPTIONS: OptionGroupOption<"all" | "library">[] = [
  { value: "all", label: "All titles" },
  { value: "library", label: "My library" },
]

const SORT_LABELS: Record<SearchSort, string> = {
  relevance: "best match",
  popularity: "popularity",
  newest: "release date",
  rating: "rating",
  title: "title",
  year: "release year",
  added: "recent activity",
}

export function SearchPageContent() {
  const params = useSearchParams()
  const { isAuthenticated } = useConvexAuth()
  const items = useQuery(api.items.listMine, isAuthenticated ? {} : "skip")
  const stateByKey = useItemStateMap(isAuthenticated)
  const collections = useCollectionSummaries(isAuthenticated)
  const [activeCardKey, setActiveCardKey] = useState<string | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const { results, recent, removeRecent, rememberSearch } = useNavigationState()
  const gridState: CardGridState = {
    stateByKey,
    collections,
    activeCardKey,
    onActiveCardKeyChange: setActiveCardKey,
  }
  const aiConfigured = useAiConfig() !== null
  const entity = readEntitySearch(params)
  const hasEntityParams = ["entity", "id", "name", "credit"].some(
    (key) => params.get(key) !== null
  )
  const entityLabel = entity
    ? entity.kind === "person"
      ? entity.credit === "crew"
        ? "Crew credits"
        : "Cast credits"
      : { genre: "Genre", country: "Country", company: "Company" }[entity.kind]
    : null
  const query = entity ? "" : (params.get("q") ?? "").slice(0, 200)
  const typeParam = params.get("type")
  const type = typeParam === "movie" || typeParam === "tv" ? typeParam : "all"
  const scope =
    !hasEntityParams && params.get("scope") === "library" ? "library" : "all"
  const invalidEntity =
    hasEntityParams && (!entity || (entity.kind === "genre" && type === "all"))
  const statusParam = params.get("status")
  const status: SearchStatus =
    statusParam === "watchlist" ||
    statusParam === "watching" ||
    statusParam === "watched"
      ? statusParam
      : "all"
  const sentimentParam = params.get("sentiment")
  const sentiment: SearchSentiment =
    sentimentParam === "liked" ||
    sentimentParam === "disliked" ||
    sentimentParam === "none"
      ? sentimentParam
      : "all"
  const collection = params.get("collection") ?? "all"
  const sortParam = params.get("sort")
  const librarySort: SearchSort =
    sortParam === "title" || sortParam === "year" || sortParam === "added"
      ? sortParam
      : "relevance"
  const entitySort: EntitySort =
    sortParam === "newest" ? "newest" : "popularity"
  const textSort: TitleSort =
    sortParam === "popularity" ||
    sortParam === "newest" ||
    sortParam === "rating" ||
    sortParam === "title"
      ? sortParam
      : "relevance"
  const activeSort: SearchSort = entity
    ? entitySort
    : scope === "library"
      ? librarySort
      : textSort
  const orderParam = params.get("order")
  const order: SortOrder =
    orderParam === "asc" || orderParam === "desc"
      ? orderParam
      : defaultSortOrder(activeSort)
  const describe =
    !hasEntityParams && params.get("mode") === "describe" && aiConfigured
  const library = hasEntityParams
    ? []
    : searchLibrary(items ?? [], stateByKey, {
        query,
        type,
        ...(scope === "library"
          ? { status, sentiment, collection, sort: librarySort, order }
          : {}),
      })
  const searchResults = results.items
  const sortOptions: { value: string; label: string }[] = entity
    ? ENTITY_SORTS
    : scope === "library"
      ? [
          { value: "relevance", label: "Best match" },
          { value: "title", label: "Title" },
          { value: "year", label: "Release year" },
          {
            value: "added",
            label: status === "all" ? "Recently saved" : "Recently marked",
          },
        ]
      : TEXT_SORTS
  const hasFilters =
    !!entity ||
    type !== "all" ||
    sortParam !== null ||
    orderParam !== null ||
    (scope === "library" &&
      (status !== "all" || sentiment !== "all" || collection !== "all"))

  const removeEntity = () => {
    const next = new URLSearchParams(params.toString())
    clearEntitySearch(next)
    next.delete("sort")
    next.delete("order")
    next.delete("mode")
    replaceSearchUrl(next)
    setActiveCardKey(null)
  }

  const update = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(values)) {
      if (value === null || value === "" || (key !== "q" && value === "all"))
        next.delete(key)
      else next.set(key, value)
    }
    replaceSearchUrl(next)
    setActiveCardKey(null)
  }

  const changeSort = (value: string) => {
    const fallback = entity ? "popularity" : "relevance"
    update({ sort: value === fallback ? null : value, order: null })
  }

  const toggleOrder = () => {
    const next: SortOrder = order === "asc" ? "desc" : "asc"
    update({ order: next === defaultSortOrder(activeSort) ? null : next })
  }

  const orderLabel = order === "asc" ? "ascending" : "descending"

  const grid = (titles: MediaItem[]) => (
    <div className={GRID_CLASS}>
      {titles.map((item) => {
        const key = mediaKey(item)
        const state = stateByKey.get(key)
        return (
          <div key={key} className="min-w-0" data-search-key={key}>
            <ShowCard
              item={item}
              state={state}
              collections={collections}
              overlayOpen={activeCardKey === key}
              onOverlayOpenChange={(open) =>
                setActiveCardKey(open ? key : null)
              }
            />
            {state && (
              <div className="mt-2 flex flex-wrap gap-1">
                {savedLabels(state).map((label) => (
                  <span
                    key={label}
                    className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground"
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  const libraryGrid = (titles: MediaItem[]) => (
    <div className={LIBRARY_GRID_CLASS}>
      {titles.map((item) => {
        const key = mediaKey(item)
        return (
          <LibraryCard
            key={key}
            item={item}
            state={stateByKey.get(key)}
            collections={collections}
          />
        )
      })}
    </div>
  )

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">
          {entity ? entity.name : "Search"}
        </h1>
        {entity && (
          <Button
            size="sm"
            variant="secondary"
            onClick={removeEntity}
            aria-label={`Remove ${entityLabel} filter for ${entity.name}`}
          >
            {entityLabel}
            <HugeiconsIcon icon={Cancel01Icon} />
          </Button>
        )}
        {aiConfigured && !describe && !hasEntityParams && (
          <Button
            variant="outline"
            onClick={() => update({ mode: "describe" })}
          >
            <HugeiconsIcon icon={AiMagicIcon} />
            Describe a mood
          </Button>
        )}
      </div>
      {invalidEntity ? (
        <div role="alert" className="flex flex-col items-start gap-3 py-6">
          <p>This search filter is invalid or incomplete.</p>
          <p className="text-sm text-muted-foreground">
            Clear it to search titles again. Genre filters require a movie or
            series type in the link.
          </p>
          <Button variant="outline" onClick={removeEntity}>
            Clear invalid filter
          </Button>
        </div>
      ) : describe ? (
        <AiDescribe
          gridState={gridState}
          onExit={() => update({ mode: null })}
        />
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {!entity && (
              <OptionGroup
                label="Search scope"
                value={scope}
                options={SEARCH_SCOPE_OPTIONS}
                onChange={(next) => {
                  if (next === "library") {
                    update({ scope: "library", sort: null, order: null })
                  } else {
                    update({
                      scope: null,
                      status: null,
                      sentiment: null,
                      collection: null,
                      sort: null,
                      order: null,
                    })
                  }
                }}
              />
            )}
            {entity?.kind === "genre" ? (
              <OptionGroup
                label="Media type"
                value={type}
                options={[
                  {
                    value: type,
                    label: type === "movie" ? "Movies" : "Series",
                  },
                ]}
                disabled
                describedBy="genre-type-help"
              />
            ) : (
              <MediaTypeToggle
                value={type}
                onChange={(value) => update({ type: value })}
              />
            )}
            <div className="flex items-center gap-1.5">
              <SearchFilter
                label={
                  scope === "library" && !entity
                    ? "Sort library results"
                    : "Sort search results"
                }
                value={activeSort}
                onChange={changeSort}
                options={sortOptions}
              />
              {activeSort !== "relevance" && (
                <Button
                  size="icon-sm"
                  variant="secondary"
                  aria-label={`Sort ${orderLabel}; switch to ${order === "asc" ? "descending" : "ascending"}`}
                  aria-pressed={order === "desc"}
                  onClick={toggleOrder}
                >
                  <HugeiconsIcon
                    icon={order === "asc" ? ArrowUp01Icon : ArrowDown01Icon}
                  />
                </Button>
              )}
            </div>
          </div>
          {entity?.kind === "genre" && (
            <p
              id="genre-type-help"
              className="mt-3 text-sm text-muted-foreground"
            >
              Genres are specific to movies or series. Remove the genre filter
              to change the media type.
            </p>
          )}
          {scope === "library" && (
            <div className="mt-4 flex flex-wrap gap-2">
              <SearchFilter
                label="Status"
                value={status}
                onChange={(value) => update({ status: value })}
                options={[
                  { value: "all", label: "Any status" },
                  { value: "watchlist", label: "Watchlist" },
                  { value: "watching", label: "Watching" },
                  { value: "watched", label: "Watched" },
                ]}
              />
              <SearchFilter
                label="Reaction"
                value={sentiment}
                onChange={(value) => update({ sentiment: value })}
                options={[
                  { value: "all", label: "Any reaction" },
                  { value: "liked", label: "Liked" },
                  { value: "disliked", label: "Disliked" },
                  { value: "none", label: "No reaction" },
                ]}
              />
              <SearchFilter
                label="Collection"
                value={collection}
                onChange={(value) => update({ collection: value })}
                options={[
                  { value: "all", label: "Any collection" },
                  ...collections.map((item) => ({
                    value: item._id,
                    label: item.name,
                  })),
                  ...(collection !== "all" &&
                  !collections.some((item) => item._id === collection)
                    ? [{ value: collection, label: "Unavailable collection" }]
                    : []),
                ]}
              />
            </div>
          )}
          <div className="my-6 flex flex-wrap items-center justify-between gap-2">
            <p role="status" className="text-sm text-muted-foreground">
              {entity
                ? `Search results ordered by ${SORT_LABELS[activeSort]} (${orderLabel}).`
                : scope === "all"
                  ? query.trim()
                    ? activeSort === "relevance"
                      ? "Search results are ordered by best match."
                      : `Search results ordered by ${SORT_LABELS[activeSort]} (${orderLabel}).`
                    : "Search movies and series, or browse your saved titles."
                  : items === undefined
                    ? "Loading your library…"
                    : `${library.length} ${library.length === 1 ? "title" : "titles"} in your library${query.trim() ? ` matching “${query.trim()}”` : ""}.`}
            </p>
            {hasFilters && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  entity
                    ? removeEntity()
                    : update({
                        type: null,
                        status: null,
                        sentiment: null,
                        collection: null,
                        sort: null,
                        order: null,
                      })
                }
              >
                Reset filters
              </Button>
            )}
          </div>
          {scope === "library" ? (
            items === undefined ? (
              <LibrarySkeleton />
            ) : library.length ? (
              libraryGrid(library)
            ) : (
              <p className="py-12 text-center text-muted-foreground">
                No saved titles match. Try clearing a filter or searching all
                titles.
              </p>
            )
          ) : !entity && !query.trim() ? (
            <div className="space-y-6 py-8">
              <p className="text-center text-muted-foreground">
                Use the search field in the navbar to find a title, or select My
                library to browse your saved titles.
              </p>
              {recent.length > 0 && (
                <section
                  className="mx-auto max-w-xl space-y-2"
                  aria-label="Recent searches"
                >
                  <h2 className="text-sm font-medium">
                    Recent searches{" "}
                    <span className="text-muted-foreground">
                      · on this device
                    </span>
                  </h2>
                  {recent.map((value) => (
                    <div key={value} className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        className="min-w-0 flex-1 justify-start truncate"
                        onClick={() => {
                          rememberSearch(value)
                          update({ q: value })
                        }}
                      >
                        {value}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove recent search ${value}`}
                        onClick={() => removeRecent(value)}
                      >
                        <HugeiconsIcon icon={Cancel01Icon} />
                      </Button>
                    </div>
                  ))}
                </section>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              {library.length > 0 && (
                <section aria-labelledby="library-search-heading">
                  <button
                    type="button"
                    aria-expanded={libraryOpen}
                    aria-controls="library-search-results"
                    onClick={() => setLibraryOpen((open) => !open)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border/60 px-4 py-3 text-left"
                  >
                    <span
                      id="library-search-heading"
                      className="text-lg font-medium"
                    >
                      In your library{" "}
                      <span className="text-sm text-muted-foreground">
                        ({library.length})
                      </span>
                    </span>
                    <HugeiconsIcon
                      icon={ArrowDown01Icon}
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform",
                        libraryOpen && "rotate-180"
                      )}
                    />
                  </button>
                  {libraryOpen && (
                    <div id="library-search-results" className="mt-4">
                      {libraryGrid(library)}
                    </div>
                  )}
                </section>
              )}
              <section aria-labelledby="search-results-heading">
                <h2
                  id="search-results-heading"
                  className="mb-4 text-lg font-medium"
                >
                  Search results
                </h2>
                {!isAuthenticated || results.loading ? (
                  <SearchSkeleton />
                ) : results.error ? (
                  <div
                    role="alert"
                    className="flex flex-col items-center gap-3 py-10"
                  >
                    <p>
                      {entity
                        ? "Couldn’t load titles for this filter."
                        : "Couldn’t search for titles."}
                    </p>
                    <Button variant="outline" onClick={results.retry}>
                      Retry search
                    </Button>
                  </div>
                ) : (
                  <>
                    {searchResults.length ? (
                      grid(searchResults)
                    ) : (
                      <p className="py-8 text-center text-muted-foreground">
                        {entity
                          ? results.hasMore
                            ? "No matching titles on this page. Try loading more results."
                            : entity.kind === "genre"
                              ? "No titles found for this genre. Remove the filter to search by title."
                              : "No titles found for this filter and media type. Try another type or remove the filter."
                          : "No matching titles. Try another title or media type."}
                      </p>
                    )}
                    {results.moreError && (
                      <p
                        role="alert"
                        className="mt-6 text-center text-sm text-destructive"
                      >
                        Couldn’t load the next page. Your results are still
                        here; try again.
                      </p>
                    )}
                    {results.hasMore && (
                      <div className="mt-8 flex justify-center">
                        <Button
                          variant="outline"
                          onClick={() => void results.loadMore()}
                          disabled={results.loadingMore}
                        >
                          {results.loadingMore
                            ? "Loading…"
                            : results.moreError
                              ? "Retry loading more"
                              : "Load more results"}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </main>
  )
}

function SearchFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(next) => {
        if (next !== null) onChange(next)
      }}
    >
      <SelectTrigger className="w-44" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function SearchSkeleton() {
  return (
    <div className={GRID_CLASS} aria-label="Loading results" aria-busy="true">
      {Array.from({ length: 12 }, (_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="aspect-2/3 w-full rounded-lg" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  )
}

function LibrarySkeleton() {
  return (
    <div
      className={LIBRARY_GRID_CLASS}
      aria-label="Loading your library"
      aria-busy="true"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="aspect-video w-full rounded-xl" />
      ))}
    </div>
  )
}
