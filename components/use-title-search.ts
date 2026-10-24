"use client"

import { useAction } from "convex/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "@/convex/_generated/api"
import type { EntitySearch } from "@/lib/entity-search"
import type { MediaItem } from "@/lib/media"
import {
  uniqueMedia,
  type EntitySort,
  type SearchType,
  type SortOrder,
  type TitleSort,
} from "@/lib/search"

type Result = {
  key: string
  items: MediaItem[]
  page: number
  hasMore: boolean
  attempt: number
}

export function useTitleSearch(
  query: string,
  type: SearchType,
  enabled: boolean,
  entity?: EntitySearch | null,
  entitySort: EntitySort = "popularity",
  textSort: TitleSort = "relevance",
  order: SortOrder = "desc"
) {
  const search = useAction(api.tmdb.search)
  const searchEntity = useAction(api.tmdb.entitySearch)
  const kind = entity?.kind
  const entityId = entity?.id
  const credit = kind === "person" ? (entity?.credit ?? "cast") : undefined
  const trimmed = entity ? "" : query.trim().slice(0, 200)
  const key = JSON.stringify(
    kind
      ? ["entity", kind, entityId, credit, type, entitySort, order]
      : [trimmed, type, textSort, order]
  )
  const active =
    enabled && (!!kind || !!trimmed) && !(kind === "genre" && type === "all")
  const delay = kind ? 0 : 350
  const fetchPage = useCallback(
    (page?: number) =>
      kind && entityId
        ? searchEntity({
            kind,
            id: entityId,
            mediaType: type,
            ...(credit ? { credit } : {}),
            sort: entitySort,
            order,
            page,
          })
        : search({
            query: trimmed,
            mediaType: type === "all" ? undefined : type,
            ...(textSort === "relevance" ? {} : { sort: textSort, order }),
            page,
          }),
    [
      kind,
      entityId,
      type,
      credit,
      entitySort,
      textSort,
      order,
      trimmed,
      search,
      searchEntity,
    ]
  )
  const [result, setResult] = useState<Result | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [moreFailure, setMoreFailure] = useState<string | null>(null)
  const [moreKey, setMoreKey] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const request = useRef(0)
  const inFlight = useRef<number | null>(null)

  useEffect(() => {
    const id = ++request.current
    if (!active || (result?.key === key && result.attempt === attempt)) return
    const timer = setTimeout(async () => {
      setFailure(null)
      try {
        const data = await fetchPage()
        if (request.current === id) {
          setResult({ key, ...data, page: 1, attempt })
        }
      } catch {
        if (request.current === id) setFailure(key)
      }
    }, delay)
    return () => {
      clearTimeout(timer)
      request.current = id + 1
    }
  }, [active, key, delay, fetchPage, attempt, result])

  const current =
    active && result?.key === key && result.attempt === attempt ? result : null
  const loadMore = async () => {
    if (!current?.hasMore || inFlight.current === request.current) return
    const id = request.current
    inFlight.current = id
    setMoreKey(key)
    setMoreFailure(null)
    try {
      const data = await fetchPage(current.page + 1)
      if (request.current === id) {
        setResult({
          key,
          items: uniqueMedia([...current.items, ...data.items]),
          page: current.page + 1,
          hasMore: data.hasMore,
          attempt,
        })
      }
    } catch {
      if (request.current === id) setMoreFailure(key)
    } finally {
      if (inFlight.current === id) {
        inFlight.current = null
        setMoreKey(null)
      }
    }
  }

  return {
    items: current?.items ?? [],
    loading: active && current === null && failure !== key,
    error: failure === key,
    hasMore: current?.hasMore ?? false,
    loadingMore: moreKey === key,
    moreError: moreFailure === key,
    loadMore,
    retry: () => {
      setFailure(null)
      setAttempt((value) => value + 1)
    },
  }
}
