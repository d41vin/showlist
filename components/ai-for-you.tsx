"use client"

import { AiMagicIcon, RefreshIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "convex/react"
import { useMemo, useState } from "react"

import { ShowCard } from "@/components/show-card"
import { useResolveRecommendations } from "@/components/use-ai-resolve"
import {
  useCollectionSummaries,
  useItemStateMap,
} from "@/components/use-item-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/convex/_generated/api"
import { aiRecommendJson, FOR_YOU_SYSTEM_PROMPT, useAiConfig } from "@/lib/ai"
import { mediaKey, type MediaItem } from "@/lib/media"

type Row = { key: string; reason?: string; item: MediaItem }

type ItemForPrompt = {
  title: string
  mediaType: "movie" | "tv"
  year: string | null
  inWatchlist: boolean
  watched: boolean
  watching?: boolean
  sentiment?: "liked" | "disliked"
}

// "For you" row on Discover: AI picks reasoned from the user's library,
// resolved into real cards. Generation is explicit (the key is the user's
// own and calls cost their money) — nothing runs until they ask for picks.
export function AiForYou({ isAuthenticated }: { isAuthenticated: boolean }) {
  const config = useAiConfig()
  const resolve = useResolveRecommendations()
  const stateByKey = useItemStateMap(isAuthenticated)
  const collections = useCollectionSummaries(isAuthenticated)
  const myItems = useQuery(api.items.listMine, isAuthenticated ? {} : "skip")

  const [rows, setRows] = useState<Row[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeCardKey, setActiveCardKey] = useState<string | null>(null)

  const excludeKeys = useMemo(
    () => new Set((myItems ?? []).map(mediaKey)),
    [myItems]
  )

  const generate = async () => {
    if (config === null || myItems === undefined || loading) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const recs = await aiRecommendJson(
        FOR_YOU_SYSTEM_PROMPT,
        buildLibraryPrompt(myItems),
        config
      )
      const resolved = await resolve(recs, excludeKeys)
      setRows(
        resolved.map(({ rec, item }) => ({
          key: mediaKey(item),
          reason: rec.reason,
          item,
        }))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI request failed.")
    } finally {
      setLoading(false)
    }
  }

  if (config === null) {
    return (
      <section className="flex items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center">
        <HugeiconsIcon
          icon={AiMagicIcon}
          className="size-4 text-muted-foreground"
        />
        <p className="text-sm text-muted-foreground">
          Add your AI key in settings (top right) to get personalized picks.
        </p>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-lg font-semibold">
          <HugeiconsIcon icon={AiMagicIcon} className="size-4" />
          For you
        </h2>
        <Button
          variant="ghost"
          size="sm"
          className="-mr-2"
          disabled={loading || myItems === undefined}
          onClick={() => void generate()}
        >
          <HugeiconsIcon icon={RefreshIcon} />
          {loading ? "Thinking…" : rows === null ? "Generate picks" : "Refresh"}
        </Button>
      </div>
      {error !== null ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void generate()}>
            Try again
          </Button>
        </div>
      ) : loading && rows === null ? (
        <div className="hide-scrollbar flex gap-4 overflow-x-auto pb-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="flex w-36 shrink-0 flex-col gap-1.5 sm:w-44"
            >
              <Skeleton className="aspect-2/3 w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      ) : rows !== null && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          The AI couldn&rsquo;t find matches — try again for new picks.
        </p>
      ) : rows === null ? (
        <p className="text-sm text-muted-foreground">
          Recommendations based on your lists, reasoned by your AI. Generating
          uses your key.
        </p>
      ) : (
        <div className="hide-scrollbar flex gap-4 overflow-x-auto pb-2">
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex w-36 shrink-0 flex-col gap-1.5 sm:w-44"
            >
              <ShowCard
                item={row.item}
                state={stateByKey.get(row.key)}
                stateByKey={stateByKey}
                collections={collections}
                overlayOpen={activeCardKey === row.key}
                onOverlayOpenChange={(open) =>
                  setActiveCardKey(open ? row.key : null)
                }
              />
              {row.reason !== undefined && (
                <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                  {row.reason}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// Compact library digest for the prompt — liked titles first so the model
// anchors on strong signal. Capped to keep the prompt small.
function buildLibraryPrompt(items: ItemForPrompt[]): string {
  const lines = [...items]
    .sort((a, b) =>
      a.sentiment === "liked" ? -1 : b.sentiment === "liked" ? 1 : 0
    )
    .slice(0, 60)
    .map((item) => {
      const flags = [
        item.inWatchlist ? "watchlist" : null,
        item.watching === true ? "watching" : null,
        item.watched ? "watched" : null,
        item.sentiment ?? null,
      ].filter(Boolean)
      return `${item.title} (${item.mediaType}${item.year ? `, ${item.year}` : ""})${
        flags.length > 0 ? ` — ${flags.join(", ")}` : ""
      }`
    })
  return lines.length > 0
    ? `My library:\n${lines.join("\n")}`
    : "My library is empty. Suggest broadly appealing, well-liked titles."
}
