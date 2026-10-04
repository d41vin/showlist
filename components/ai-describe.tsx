"use client"

import { AiMagicIcon, Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState } from "react"

import { ShowCard } from "@/components/show-card"
import { useResolveRecommendations } from "@/components/use-ai-resolve"
import type { CardGridState } from "@/components/use-item-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  aiRecommendJson,
  DESCRIBE_SYSTEM_PROMPT,
  useAiConfig,
} from "@/lib/ai"

type Row = { key: string; recReason?: string; item: Parameters<typeof ShowCard>[0]["item"] }

// Describe mode: the user types what they feel like watching, the AI (in
// their browser) suggests titles, each resolved to a real card from TMDB.
export function AiDescribe({
  gridState,
  onExit,
}: {
  gridState: CardGridState
  onExit: () => void
}) {
  const config = useAiConfig()
  const resolve = useResolveRecommendations()

  const [prompt, setPrompt] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [ranOnce, setRanOnce] = useState(false)

  const run = async () => {
    const text = prompt.trim()
    if (config === null || text === "" || loading) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const recs = await aiRecommendJson(
        DESCRIBE_SYSTEM_PROMPT,
        text,
        config
      )
      const resolved = await resolve(recs)
      setRows(
        resolved.map(({ rec, item }) => ({
          key: `${item.mediaType}:${item.tmdbId}`,
          recReason: rec.reason,
          item,
        }))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
    } finally {
      setLoading(false)
      setRanOnce(true)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void run()
        }}
      >
        <Input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. a cozy mystery series, or Inception but a comedy"
          aria-label="Describe what you want to watch"
          autoFocus
        />
        <Button
          type="submit"
          disabled={config === null || prompt.trim() === "" || loading}
        >
          <HugeiconsIcon icon={AiMagicIcon} />
          {loading ? "Thinking…" : "Suggest"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Exit describe mode"
          onClick={onExit}
        >
          <HugeiconsIcon icon={Cancel01Icon} />
        </Button>
      </form>

      {error !== null && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {error}
        </p>
      )}
      {loading && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="aspect-2/3 w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      )}
      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {rows.map((row) => (
            <div key={row.key} className="flex flex-col gap-1.5">
              <ShowCard
                item={row.item}
                state={gridState.stateByKey.get(row.key)}
                collections={gridState.collections}
                overlayOpen={gridState.activeCardKey === row.key}
                onOverlayOpenChange={(open) =>
                  gridState.onActiveCardKeyChange(open ? row.key : null)
                }
              />
              {row.recReason !== undefined && (
                <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                  {row.recReason}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      {!loading && ranOnce && error === null && rows.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No real titles matched those suggestions. Try rephrasing.
        </p>
      )}
      {!loading && !ranOnce && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Describe a vibe, a mood, or a mashup — the AI suggests real titles
          you can add straight to your lists.
        </p>
      )}
    </div>
  )
}
