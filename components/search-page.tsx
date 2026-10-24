"use client"

import { useConvexAuth, useQuery } from "convex/react"
import { useSearchParams } from "next/navigation"
import { useRef, useState } from "react"
import { AiMagicIcon, Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { AiDescribe } from "@/components/ai-describe"
import { DetailsDrawer } from "@/components/details-drawer"
import { MediaTypeToggle } from "@/components/media-type-toggle"
import { ShowCard } from "@/components/show-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { useTitleSearch } from "@/components/use-title-search"
import { api } from "@/convex/_generated/api"
import { useAiConfig } from "@/lib/ai"
import { mediaKey, type MediaItem } from "@/lib/media"
import {
  savedLabels,
  searchLibrary,
  type SearchSort,
  type SearchStatus,
  type SearchSentiment,
} from "@/lib/search"

const GRID_CLASS =
  "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"

export function SearchPageContent() {
  const params = useSearchParams()
  const { isAuthenticated } = useConvexAuth()
  const items = useQuery(api.items.listMine, isAuthenticated ? {} : "skip")
  const stateByKey = useItemStateMap(isAuthenticated)
  const collections = useCollectionSummaries(isAuthenticated)
  const [activeCardKey, setActiveCardKey] = useState<string | null>(null)
  const [selected, setSelected] = useState<MediaItem | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const gridState: CardGridState = {
    stateByKey,
    collections,
    activeCardKey,
    onActiveCardKeyChange: setActiveCardKey,
  }
  const aiConfigured = useAiConfig() !== null
  const query = (params.get("q") ?? "").slice(0, 200)
  const typeParam = params.get("type")
  const type = typeParam === "movie" || typeParam === "tv" ? typeParam : "all"
  const scope = params.get("scope") === "library" ? "library" : "all"
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
  const sort: SearchSort =
    sortParam === "title" || sortParam === "year" || sortParam === "added"
      ? sortParam
      : "relevance"
  const describe = params.get("mode") === "describe" && aiConfigured
  const results = useTitleSearch(
    query,
    type,
    isAuthenticated && scope === "all" && !describe
  )
  const library = searchLibrary(items ?? [], stateByKey, {
    query,
    type,
    ...(scope === "library" ? { status, sentiment, collection, sort } : {}),
  })
  const libraryKeys = new Set(library.map(mediaKey))
  const catalogue = results.items.filter(
    (item) => !libraryKeys.has(mediaKey(item))
  )
  const hasFilters =
    type !== "all" ||
    (scope === "library" &&
      (status !== "all" ||
        sentiment !== "all" ||
        collection !== "all" ||
        sort !== "relevance"))

  const update = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(values)) {
      if (value === null || value === "" || (key !== "q" && value === "all"))
        next.delete(key)
      else next.set(key, value)
    }
    window.history.replaceState(
      null,
      "",
      `/search${next.size ? `?${next}` : ""}`
    )
    setActiveCardKey(null)
  }

  const grid = (titles: MediaItem[]) => (
    <div className={GRID_CLASS}>
      {titles.map((item) => {
        const key = mediaKey(item)
        const state = stateByKey.get(key)
        return (
          <div key={key} className="min-w-0" data-search-key={key}>
            <ShowCard
              onOpenDetails={() => {
                setSelected(item)
                setDetailsOpen(true)
              }}
              item={item}
              state={state}
              stateByKey={stateByKey}
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

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      {selected && (
        <DetailsDrawer
          key={mediaKey(selected)}
          item={selected}
          state={stateByKey.get(mediaKey(selected))}
          stateByKey={stateByKey}
          collections={collections}
          open={detailsOpen}
          trigger={() => null}
          onOpenChange={setDetailsOpen}
          onOpenChangeComplete={(open) => {
            if (!open) setSelected(null)
          }}
          finalFocus={() =>
            document.querySelector<HTMLButtonElement>(
              `[data-search-key="${mediaKey(selected)}"] [data-search-title]`
            ) ?? inputRef.current
          }
        />
      )}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        {aiConfigured && !describe && (
          <Button
            variant="outline"
            onClick={() => update({ mode: "describe" })}
          >
            <HugeiconsIcon icon={AiMagicIcon} />
            Describe a mood
          </Button>
        )}
      </div>
      {describe ? (
        <AiDescribe
          gridState={gridState}
          onExit={() => update({ mode: null })}
        />
      ) : (
        <>
          <div className="relative max-w-2xl">
            <HugeiconsIcon
              icon={Search01Icon}
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              ref={inputRef}
              type="search"
              className="pl-9"
              value={query}
              maxLength={200}
              onChange={(event) => update({ q: event.target.value })}
              aria-label="Search movies, TV and your library"
              placeholder="Search movies, TV and your library…"
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div
              role="group"
              aria-label="Search scope"
              className="flex gap-1.5"
            >
              <Button
                size="sm"
                variant={scope === "all" ? "default" : "secondary"}
                aria-pressed={scope === "all"}
                onClick={() =>
                  update({
                    scope: null,
                    status: null,
                    sentiment: null,
                    collection: null,
                    sort: null,
                  })
                }
              >
                All titles
              </Button>
              <Button
                size="sm"
                variant={scope === "library" ? "default" : "secondary"}
                aria-pressed={scope === "library"}
                onClick={() => update({ scope: "library" })}
              >
                My library
              </Button>
            </div>
            <MediaTypeToggle
              value={type}
              onChange={(value) => update({ type: value })}
            />
          </div>
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
              <SearchFilter
                label="Sort library results"
                value={sort}
                onChange={(value) => update({ sort: value })}
                options={[
                  { value: "relevance", label: "Best match" },
                  { value: "title", label: "Title A–Z" },
                  { value: "year", label: "Newest year" },
                  {
                    value: "added",
                    label:
                      status === "all" ? "Recently saved" : "Recently marked",
                  },
                ]}
              />
            </div>
          )}
          <div className="my-6 flex flex-wrap items-center justify-between gap-2">
            <p role="status" className="text-sm text-muted-foreground">
              {scope === "all"
                ? "Catalogue results are ordered by best match. Saved titles appear first."
                : items === undefined
                  ? "Loading your library…"
                  : `${library.length} ${library.length === 1 ? "title" : "titles"} in your library${query.trim() ? ` matching “${query.trim()}”` : ""}.`}
            </p>
            {hasFilters && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  update({
                    type: null,
                    status: null,
                    sentiment: null,
                    collection: null,
                    sort: null,
                  })
                }
              >
                Reset filters
              </Button>
            )}
          </div>
          {scope === "library" ? (
            items === undefined ? (
              <SearchSkeleton />
            ) : library.length ? (
              grid(library)
            ) : (
              <p className="py-12 text-center text-muted-foreground">
                No saved titles match. Try clearing a filter or searching all
                titles.
              </p>
            )
          ) : !query.trim() ? (
            <p className="py-12 text-center text-muted-foreground">
              Enter a title to search the catalogue, or select My library to
              browse your saved titles.
            </p>
          ) : (
            <div className="space-y-8">
              {library.length > 0 && (
                <section aria-labelledby="library-search-heading">
                  <h2
                    id="library-search-heading"
                    className="mb-4 text-lg font-medium"
                  >
                    In your library{" "}
                    <span className="text-sm text-muted-foreground">
                      ({library.length})
                    </span>
                  </h2>
                  {grid(library)}
                </section>
              )}
              <section aria-labelledby="catalogue-search-heading">
                <h2
                  id="catalogue-search-heading"
                  className="mb-4 text-lg font-medium"
                >
                  Catalogue
                </h2>
                {!isAuthenticated || results.loading ? (
                  <SearchSkeleton />
                ) : results.error ? (
                  <div
                    role="alert"
                    className="flex flex-col items-center gap-3 py-10"
                  >
                    <p>Couldn’t search the catalogue.</p>
                    <Button variant="outline" onClick={results.retry}>
                      Retry search
                    </Button>
                  </div>
                ) : (
                  <>
                    {catalogue.length ? (
                      grid(catalogue)
                    ) : (
                      <p className="py-8 text-center text-muted-foreground">
                        {library.length
                          ? "Matching titles on this page are already shown in your library."
                          : "No matching titles on this page. Try another title or media type."}
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
