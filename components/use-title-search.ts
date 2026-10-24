"use client"

import { useAction } from "convex/react"
import { useEffect, useRef, useState } from "react"
import { api } from "@/convex/_generated/api"
import type { MediaItem } from "@/lib/media"
import { uniqueMedia, type SearchType } from "@/lib/search"

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
  enabled: boolean
) {
  const search = useAction(api.tmdb.search)
  const trimmed = query.trim().slice(0, 200)
  const key = JSON.stringify([trimmed, type])
  const [result, setResult] = useState<Result | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [moreFailure, setMoreFailure] = useState<string | null>(null)
  const [moreKey, setMoreKey] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const request = useRef(0)
  const inFlight = useRef<number | null>(null)

  useEffect(() => {
    const id = ++request.current
    if (
      !enabled ||
      !trimmed ||
      (result?.key === key && result.attempt === attempt)
    )
      return
    const timer = setTimeout(async () => {
      setFailure(null)
      try {
        const data = await search({
          query: trimmed,
          mediaType: type === "all" ? undefined : type,
        })
        if (request.current === id) {
          setResult({ key, ...data, page: 1, attempt })
        }
      } catch {
        if (request.current === id) setFailure(key)
      }
    }, 350)
    return () => {
      clearTimeout(timer)
      request.current = id + 1
    }
  }, [trimmed, type, key, enabled, search, attempt, result])

  const current =
    enabled && trimmed && result?.key === key && result.attempt === attempt
      ? result
      : null
  const loadMore = async () => {
    if (!current?.hasMore || inFlight.current === request.current) return
    const id = request.current
    inFlight.current = id
    setMoreKey(key)
    setMoreFailure(null)
    try {
      const data = await search({
        query: trimmed,
        mediaType: type === "all" ? undefined : type,
        page: current.page + 1,
      })
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
    loading: enabled && !!trimmed && current === null && failure !== key,
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
