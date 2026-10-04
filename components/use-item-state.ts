"use client"

import { useQuery } from "convex/react"
import { useMemo } from "react"

import { api } from "@/convex/_generated/api"
import { type Id } from "@/convex/_generated/dataModel"
import {
  mediaKey,
  type CollectionSummary,
  type ItemState,
} from "@/lib/media"

// Everything a card grid needs to render per-title state: the user's items
// mapped by media key, plus their collections. Shared by the home tab grids,
// search results, Discover and the AI features.
export type CardGridState = {
  stateByKey: Map<string, ItemState>
  collections: CollectionSummary[]
  activeCardKey: string | null
  onActiveCardKeyChange: (key: string | null) => void
}

export function useCollectionSummaries(
  isAuthenticated: boolean
): CollectionSummary[] {
  const myCollections = useQuery(
    api.collections.listMine,
    isAuthenticated ? {} : "skip"
  )
  return useMemo(
    () =>
      [...(myCollections ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [myCollections]
  )
}

export function useItemStateMap(
  isAuthenticated: boolean
): Map<string, ItemState> {
  const myItems = useQuery(api.items.listMine, isAuthenticated ? {} : "skip")
  const memberships = useQuery(
    api.collections.listMemberships,
    isAuthenticated ? {} : "skip"
  )

  return useMemo(() => {
    const idsByItem = new Map<Id<"items">, Set<Id<"collections">>>()
    for (const membership of memberships ?? []) {
      const ids = idsByItem.get(membership.itemId) ?? new Set()
      ids.add(membership.collectionId)
      idsByItem.set(membership.itemId, ids)
    }
    const map = new Map<string, ItemState>()
    for (const item of myItems ?? []) {
      map.set(mediaKey(item), {
        itemId: item._id,
        inWatchlist: item.inWatchlist,
        watching: item.watching ?? false,
        watched: item.watched,
        sentiment: item.sentiment,
        collectionIds: idsByItem.get(item._id) ?? new Set(),
      })
    }
    return map
  }, [myItems, memberships])
}
