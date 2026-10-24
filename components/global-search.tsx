"use client"

import { useUser } from "@clerk/nextjs"
import {
  Search01Icon,
  Cancel01Icon,
  AiMagicIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useConvexAuth, useQuery } from "convex/react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useEffect, useId, useRef, useState } from "react"

import { DetailsDrawer } from "@/components/details-drawer"
import { MediaTypeToggle } from "@/components/media-type-toggle"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  useCollectionSummaries,
  useItemStateMap,
} from "@/components/use-item-state"
import { useTitleSearch } from "@/components/use-title-search"
import { api } from "@/convex/_generated/api"
import { useAiConfig } from "@/lib/ai"
import { mediaKey, tmdbPosterThumbUrl, type MediaItem } from "@/lib/media"
import {
  savedLabels,
  searchHref,
  searchLibrary,
  type SearchType,
} from "@/lib/search"
import { cn } from "@/lib/utils"

export function GlobalSearch() {
  const router = useRouter()
  const { user } = useUser()
  const { isAuthenticated } = useConvexAuth()
  const stateByKey = useItemStateMap(isAuthenticated)
  const collections = useCollectionSummaries(isAuthenticated)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<MediaItem | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [type, setType] = useState<SearchType>("all")
  const [recent, setRecent] = useState<string[]>([])
  const storageKey = `showlist:searches:${user?.id ?? ""}`

  const remember = (value: string) => {
    const trimmed = value.trim().slice(0, 200)
    if (!trimmed) return
    const next = [trimmed, ...recent.filter((item) => item !== trimmed)].slice(
      0,
      6
    )
    setRecent(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {}
  }
  const openSearch = () => {
    try {
      const stored: unknown = JSON.parse(
        localStorage.getItem(storageKey) ?? "[]"
      )
      setRecent(
        Array.isArray(stored)
          ? stored
              .filter(
                (v): v is string => typeof v === "string" && v.length <= 200
              )
              .slice(0, 6)
          : []
      )
    } catch {
      setRecent([])
    }
    setOpen(true)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (document.querySelector('[role="dialog"]') && !open) return
        event.preventDefault()
        triggerRef.current?.click()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open])

  const seeAll = () => {
    remember(query)
    setOpen(false)
    router.push(searchHref(query, type))
  }

  return (
    <>
      <Button
        ref={triggerRef}
        variant="outline"
        size="sm"
        className="shrink-0 px-2 lg:w-64 lg:justify-start lg:px-3"
        aria-label="Search movies and TV"
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+k Meta+k"
        onClick={openSearch}
      >
        <HugeiconsIcon icon={Search01Icon} />
        <span className="hidden text-muted-foreground lg:inline">
          Search movies & TV…
        </span>
        <kbd className="ml-auto hidden text-[10px] text-muted-foreground lg:inline">
          Ctrl / ⌘ K
        </kbd>
      </Button>
      {open && (
        <QuickSearch
          query={query}
          setQuery={setQuery}
          type={type}
          setType={setType}
          recent={recent}
          onRemoveRecent={(value) => {
            const next = recent.filter((item) => item !== value)
            setRecent(next)
            try {
              localStorage.setItem(storageKey, JSON.stringify(next))
            } catch {}
          }}
          onClose={() => setOpen(false)}
          finalFocus={triggerRef}
          onSeeAll={seeAll}
          onDescribe={() => {
            setOpen(false)
            router.push("/search?mode=describe")
          }}
          onSelect={(item) => {
            remember(query)
            setOpen(false)
            setSelected(item)
            setDetailsOpen(true)
          }}
        />
      )}
      {selected && (
        <DetailsDrawer
          key={mediaKey(selected)}
          item={selected}
          state={stateByKey.get(mediaKey(selected))}
          stateByKey={stateByKey}
          collections={collections}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          onOpenChangeComplete={(value) => {
            if (!value) setSelected(null)
          }}
          finalFocus={triggerRef}
          trigger={() => null}
        />
      )}
    </>
  )
}

function QuickSearch({
  query,
  setQuery,
  type,
  setType,
  recent,
  onRemoveRecent,
  onClose,
  onSeeAll,
  onDescribe,
  onSelect,
  finalFocus,
}: {
  query: string
  setQuery: (value: string) => void
  type: SearchType
  setType: (value: SearchType) => void
  recent: string[]
  onRemoveRecent: (value: string) => void
  onClose: () => void
  onSeeAll: () => void
  onDescribe: () => void
  onSelect: (item: MediaItem) => void
  finalFocus: React.RefObject<HTMLButtonElement | null>
}) {
  const { isAuthenticated } = useConvexAuth()
  const items = useQuery(api.items.listMine, isAuthenticated ? {} : "skip")
  const states = useItemStateMap(isAuthenticated)
  const aiConfigured = useAiConfig() !== null
  const results = useTitleSearch(query, type, isAuthenticated)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const [active, setActive] = useState(-1)
  const library = query.trim()
    ? searchLibrary(items ?? [], states, { query, type }).slice(0, 5)
    : []
  const libraryKeys = new Set(library.map(mediaKey))
  const catalogue = results.items
    .filter((item) => !libraryKeys.has(mediaKey(item)))
    .slice(0, 8)
  const choices = [...library, ...catalogue]
  const selectedIndex = active < choices.length ? active : -1

  const updateQuery = (value: string) => {
    setActive(-1)
    setQuery(value)
  }
  const option = (item: MediaItem, index: number) => (
    <button
      key={mediaKey(item)}
      id={`${listId}-${index}`}
      type="button"
      role="option"
      aria-selected={selectedIndex === index}
      tabIndex={-1}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-muted",
        selectedIndex === index && "bg-muted"
      )}
      onPointerMove={() => setActive(index)}
      onClick={() => onSelect(item)}
    >
      <span className="relative h-16 w-11 shrink-0 overflow-hidden rounded bg-muted">
        {item.posterPath && (
          <Image
            src={tmdbPosterThumbUrl(item.posterPath)}
            alt=""
            fill
            sizes="44px"
            className="object-cover"
          />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{item.title}</span>
        <span className="block text-xs text-muted-foreground">
          {item.year ?? "Year unknown"} ·{" "}
          {item.mediaType === "movie" ? "Movie" : "TV"}
        </span>
        <span className="mt-1 flex flex-wrap gap-1">
          {savedLabels(states.get(mediaKey(item))).map((label) => (
            <span
              key={label}
              className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground"
            >
              {label}
            </span>
          ))}
        </span>
      </span>
    </button>
  )

  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value) onClose()
      }}
    >
      <DialogContent
        initialFocus={inputRef}
        finalFocus={finalFocus}
        className="top-0 left-0 flex h-dvh max-h-dvh max-w-none translate-x-0 translate-y-0 flex-col gap-4 rounded-none p-4 sm:top-[10vh] sm:left-1/2 sm:h-auto sm:max-h-[80dvh] sm:max-w-xl sm:-translate-x-1/2 sm:rounded-2xl sm:p-6"
      >
        <DialogTitle className="pr-10">Search movies & TV</DialogTitle>
        <DialogDescription className="sr-only">
          Search your library and the catalogue. Use arrow keys to select a
          title, or Enter to see all results.
        </DialogDescription>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            onSeeAll()
          }}
        >
          <Input
            ref={inputRef}
            type="search"
            value={query}
            maxLength={200}
            onChange={(event) => updateQuery(event.target.value)}
            placeholder="A title you have in mind…"
            aria-label="Search titles"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={choices.length > 0}
            aria-controls={query.trim() ? listId : undefined}
            aria-activedescendant={
              selectedIndex >= 0 ? `${listId}-${selectedIndex}` : undefined
            }
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return
              if (
                (event.key === "ArrowDown" || event.key === "ArrowUp") &&
                choices.length
              ) {
                event.preventDefault()
                const next =
                  event.key === "ArrowDown"
                    ? (selectedIndex + 1) % choices.length
                    : selectedIndex <= 0
                      ? choices.length - 1
                      : selectedIndex - 1
                setActive(next)
                document
                  .getElementById(`${listId}-${next}`)
                  ?.scrollIntoView({ block: "nearest" })
              } else if (event.key === "Enter") {
                event.preventDefault()
                if (selectedIndex >= 0) onSelect(choices[selectedIndex])
                else onSeeAll()
              }
            }}
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        <MediaTypeToggle
          value={type}
          onChange={(value) => {
            setActive(-1)
            setType(value)
          }}
        />
        <ScrollArea className="min-h-0 flex-1 sm:min-h-28">
          {!query.trim() ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                Find a title, check what you’ve saved, or explore all results
                with library filters.
              </p>
              {recent.length > 0 && (
                <>
                  <h3 className="text-xs font-medium text-muted-foreground">
                    Recent searches · saved on this device
                  </h3>
                  {recent.map((value) => (
                    <div key={value} className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        className="min-w-0 flex-1 justify-start truncate"
                        onClick={() => updateQuery(value)}
                      >
                        {value}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove recent search ${value}`}
                        onClick={() => onRemoveRecent(value)}
                      >
                        <HugeiconsIcon icon={Cancel01Icon} />
                      </Button>
                    </div>
                  ))}
                </>
              )}
            </div>
          ) : (
            <>
              <div id={listId} role="listbox" aria-label="Matching titles">
                {library.length > 0 && (
                  <div role="group" aria-label="In your library">
                    <h3 className="px-2 py-2 text-xs font-medium text-muted-foreground">
                      In your library
                    </h3>
                    {library.map(option)}
                  </div>
                )}
                {catalogue.length > 0 && (
                  <div role="group" aria-label="Catalogue">
                    <h3 className="px-2 py-2 text-xs font-medium text-muted-foreground">
                      Catalogue
                    </h3>
                    {catalogue.map((item, index) =>
                      option(item, library.length + index)
                    )}
                  </div>
                )}
              </div>
              <div
                role="status"
                className="px-2 py-3 text-sm text-muted-foreground"
              >
                {!isAuthenticated ? (
                  "Connecting to your library…"
                ) : results.loading ? (
                  "Searching the catalogue…"
                ) : results.error ? (
                  <span>
                    Catalogue search failed.{" "}
                    <Button variant="link" size="sm" onClick={results.retry}>
                      Retry
                    </Button>
                  </span>
                ) : choices.length === 0 ? (
                  "No matching titles. Try another title or see all results."
                ) : null}
              </div>
            </>
          )}
        </ScrollArea>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <Button variant="outline" onClick={onSeeAll}>
            See all results & filters
          </Button>
          {aiConfigured && (
            <Button variant="ghost" onClick={onDescribe}>
              <HugeiconsIcon icon={AiMagicIcon} />
              Describe a mood
            </Button>
          )}
          <span className="hidden text-xs text-muted-foreground sm:inline">
            ↑ ↓ select · Enter open · Esc close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
