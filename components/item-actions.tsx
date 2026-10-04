"use client"

import {
  BookmarkAdd01Icon,
  BookmarkCheck01Icon,
  CheckmarkCircle02Icon,
  EyeIcon,
  FolderAddIcon,
  FolderCheckIcon,
  PlayCircle02Icon,
  PlayIcon,
  PlusSignIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation } from "convex/react"
import { useState } from "react"

import { CreateCollectionDialog } from "@/components/create-collection-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { api } from "@/convex/_generated/api"
import { type Id } from "@/convex/_generated/dataModel"
import {
  type CollectionSummary,
  type ItemState,
  type MediaItem,
  type Sentiment,
} from "@/lib/media"
import { cn } from "@/lib/utils"

// The in-app action buttons for one title — shared by the card overlay
// (stacked), the details drawer and the discover hero (horizontal row).
export function ItemActions({
  item,
  state,
  collections,
  layout = "stack",
}: {
  item: MediaItem
  state: ItemState | undefined
  collections: CollectionSummary[]
  layout?: "stack" | "row"
}) {
  const toggleWatchlist = useMutation(api.items.toggleWatchlist)
  const toggleWatched = useMutation(api.items.toggleWatched)
  const toggleWatching = useMutation(api.items.toggleWatching)
  const setSentiment = useMutation(api.items.setSentiment)

  // Mutations only accept the exact snapshot shape, so rebuild it — list
  // items carry extra Convex doc fields.
  const snapshot = {
    tmdbId: item.tmdbId,
    mediaType: item.mediaType,
    title: item.title,
    posterPath: item.posterPath,
    year: item.year,
  }

  const inWatchlist = state?.inWatchlist ?? false
  const watched = state?.watched ?? false
  const watching = state?.watching ?? false
  const sentiment = state?.sentiment
  const stacked = layout === "stack"

  return (
    <>
      <Button
        variant={inWatchlist ? "default" : "secondary"}
        size="sm"
        className={stacked ? "w-full" : undefined}
        aria-pressed={inWatchlist}
        onClick={() => toggleWatchlist({ item: snapshot })}
      >
        <HugeiconsIcon
          icon={inWatchlist ? BookmarkCheck01Icon : BookmarkAdd01Icon}
        />
        Watchlist
      </Button>
      <Button
        variant={watched ? "default" : "secondary"}
        size="sm"
        className={stacked ? "w-full" : undefined}
        aria-pressed={watched}
        onClick={() => toggleWatched({ item: snapshot })}
      >
        <HugeiconsIcon icon={watched ? CheckmarkCircle02Icon : EyeIcon} />
        Watched
      </Button>
      <Button
        variant={watching ? "default" : "secondary"}
        size="sm"
        className={stacked ? "w-full" : undefined}
        aria-pressed={watching}
        onClick={() => toggleWatching({ item: snapshot })}
      >
        <HugeiconsIcon icon={watching ? PlayCircle02Icon : PlayIcon} />
        Watching
      </Button>
      <CollectionsPopover
        snapshot={snapshot}
        state={state}
        collections={collections}
        stacked={stacked}
      />
      <div className={cn("flex gap-1.5", stacked && "mt-1 justify-center")}>
        <SentimentButton
          value="liked"
          icon={ThumbsUpIcon}
          active={sentiment === "liked"}
          onToggle={() => setSentiment({ item: snapshot, sentiment: "liked" })}
        />
        <SentimentButton
          value="disliked"
          icon={ThumbsDownIcon}
          active={sentiment === "disliked"}
          onToggle={() =>
            setSentiment({ item: snapshot, sentiment: "disliked" })
          }
        />
      </div>
    </>
  )
}

function SentimentButton({
  value,
  icon,
  active,
  onToggle,
}: {
  value: Sentiment
  icon: typeof ThumbsUpIcon
  active: boolean
  onToggle: () => void
}) {
  return (
    <Button
      variant={active ? "default" : "secondary"}
      size="icon-sm"
      aria-pressed={active}
      aria-label={value === "liked" ? "Liked" : "Disliked"}
      onClick={onToggle}
    >
      <HugeiconsIcon icon={icon} />
    </Button>
  )
}

// Checkbox list of the user's collections for one title, plus a "New
// collection" entry that opens the shared create dialog (and adds the
// title to the collection it just created).
function CollectionsPopover({
  snapshot,
  state,
  collections,
  stacked,
}: {
  snapshot: MediaItem
  state: ItemState | undefined
  collections: CollectionSummary[]
  stacked: boolean
}) {
  const addItem = useMutation(api.collections.addItem)
  const removeItem = useMutation(api.collections.removeItem)
  const [createOpen, setCreateOpen] = useState(false)

  const collectionIds = state?.collectionIds
  const inAnyCollection = (collectionIds?.size ?? 0) > 0

  const toggle = (collectionId: Id<"collections">, checked: boolean) => {
    if (checked) {
      void addItem({ collectionId, item: snapshot })
    } else if (state !== undefined) {
      void removeItem({ collectionId, itemId: state.itemId })
    }
  }

  return (
    <>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant={inAnyCollection ? "default" : "secondary"}
              size="sm"
              className={stacked ? "w-full" : undefined}
              aria-pressed={inAnyCollection}
            />
          }
        >
          <HugeiconsIcon
            icon={inAnyCollection ? FolderCheckIcon : FolderAddIcon}
          />
          Collections
        </PopoverTrigger>
        <PopoverContent className="w-60 gap-0.5 p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start px-2.5"
            onClick={() => setCreateOpen(true)}
          >
            <HugeiconsIcon icon={PlusSignIcon} />
            New collection
          </Button>
          {collections.length > 0 && (
            <div className="my-1 h-px bg-border/50" aria-hidden />
          )}
          {collections.map((collection) => (
            <label
              key={collection._id}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium hover:bg-accent"
            >
              <Checkbox
                checked={collectionIds?.has(collection._id) ?? false}
                onCheckedChange={(checked) =>
                  toggle(collection._id, checked === true)
                }
              />
              <span className="truncate">{collection.name}</span>
            </label>
          ))}
        </PopoverContent>
      </Popover>
      <CreateCollectionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(collectionId) =>
          void addItem({ collectionId, item: snapshot })
        }
      />
    </>
  )
}
