"use client"

import { useAction } from "convex/react"
import { useCallback } from "react"

import { api } from "@/convex/_generated/api"
import { type AiRecommendation } from "@/lib/ai"
import { mediaKey, type MediaItem } from "@/lib/media"

export type ResolvedRecommendation = {
  rec: AiRecommendation
  item: MediaItem
}

// Resolves AI title suggestions into real TMDB items via search. Unmatched
// titles and duplicates are dropped; order follows the AI's ranking.
export function useResolveRecommendations() {
  const search = useAction(api.tmdb.search)

  return useCallback(
    async (
      recs: AiRecommendation[],
      exclude?: ReadonlySet<string>
    ): Promise<ResolvedRecommendation[]> => {
      const settled = await Promise.all(
        recs.map(async (rec) => {
          try {
            const { items } = await search({ query: rec.title })
            const match =
              items.find(
                (item) =>
                  (rec.mediaType === undefined ||
                    item.mediaType === rec.mediaType) &&
                  (rec.year === undefined || item.year === String(rec.year))
              ) ??
              items.find(
                (item) =>
                  rec.mediaType === undefined ||
                  item.mediaType === rec.mediaType
              ) ??
              items[0] ??
              null
            return { rec, item: match }
          } catch {
            return { rec, item: null }
          }
        })
      )
      const out: ResolvedRecommendation[] = []
      const seen = new Set<string>()
      for (const { rec, item } of settled) {
        if (item === null) continue
        const key = mediaKey(item)
        if (seen.has(key) || exclude?.has(key)) continue
        seen.add(key)
        out.push({ rec, item })
      }
      return out
    },
    [search]
  )
}
