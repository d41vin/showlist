"use client"

import { useUser } from "@clerk/nextjs"
import { useAction, useConvexAuth } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { usePathname, useSearchParams } from "next/navigation"
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useCallback,
  type SetStateAction,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { useTitleSearch } from "@/components/use-title-search"
import { api } from "@/convex/_generated/api"
import { useAiConfig } from "@/lib/ai"
import { readEntitySearch } from "@/lib/entity-search"
import { mediaKey, type MediaItem, type MediaType } from "@/lib/media"
import {
  defaultSortOrder,
  type EntitySort,
  type SortOrder,
  type TitleSort,
} from "@/lib/search"

type Origin = {
  href: string
  scrollY: number
  drawerScrollY: number | null
  element: HTMLElement | null
  focusHref: string | null
}

type TitlePayload = FunctionReturnType<typeof api.tmdb.title>
type PendingTitle = { item: MediaItem; origin: Origin }
type TitleRequest = {
  promise: Promise<TitlePayload>
  data?: TitlePayload
  at: number
}

function currentOrigin(): Origin {
  return {
    href: `${location.pathname}${location.search}${location.hash}`,
    scrollY: window.scrollY,
    drawerScrollY:
      document.querySelector(
        '[data-slot="drawer-popup"] [data-slot="scroll-area-viewport"]'
      )?.scrollTop ?? null,
    element:
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null,
    focusHref:
      document.activeElement?.closest("a[href]")?.getAttribute("href") ?? null,
  }
}

type DrawerOrigin = { origin: Origin; depth: number }
type EntryOrigin = {
  kind: "search" | "title"
  origin: Origin
  drawer?: DrawerOrigin
}

function subscribeNavigation(onChange: () => void) {
  window.addEventListener("popstate", onChange)
  window.addEventListener("showlist:navigation", onChange)
  return () => {
    window.removeEventListener("popstate", onChange)
    window.removeEventListener("showlist:navigation", onChange)
  }
}

function navigationSnapshot(): string | null {
  return window.history.state?.showlistOrigin ?? null
}

function subscribeRecent(onChange: () => void) {
  window.addEventListener("storage", onChange)
  window.addEventListener("showlist:searches", onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener("showlist:searches", onChange)
  }
}

const NavigationContext = createContext<{
  searchOrigin: Origin | null
  titleOrigin: Origin | null
  drawerOrigin: DrawerOrigin | null
  returnToOrigin: (origin: Origin, depth?: number) => void
  captureSearchOrigin: () => void
  captureTitleOrigin: () => void
  keepTitleOrigin: () => void
  pendingTitle: PendingTitle | null
  prepareTitle: (item: MediaItem, drawer: boolean) => void
  clearPendingTitle: () => void
  loadTitle: (
    item: { mediaType: MediaType; tmdbId: number },
    refresh?: boolean
  ) => Promise<TitlePayload>
  cachedTitle: (item: {
    mediaType: MediaType
    tmdbId: number
  }) => TitlePayload | undefined
  restoreOrigin: (origin: Origin) => void
  recent: string[]
  rememberSearch: (query: string) => void
  removeRecent: (query: string) => void
  results: ReturnType<typeof useTitleSearch>
  retained: Map<string, unknown>
  userKey: string
} | null>(null)

export function NavigationProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const params = useSearchParams()
  const { user } = useUser()
  const { isAuthenticated } = useConvexAuth()
  const aiConfigured = useAiConfig() !== null
  const [retained] = useState(() => new Map<string, unknown>())
  const origins = useRef(new Map<string, EntryOrigin>())
  const pending = useRef<EntryOrigin | null>(null)
  const returning = useRef<Origin | null>(null)
  const [pendingTitle, setPendingTitle] = useState<PendingTitle | null>(null)
  const titleRequests = useRef(new Map<string, TitleRequest>())
  const lookupTitle = useAction(api.tmdb.title)
  const titleCacheKey = useCallback(
    (item: { mediaType: MediaType; tmdbId: number }) =>
      `${user?.id ?? ""}:${mediaKey(item)}`,
    [user?.id]
  )
  const loadTitle = useCallback(
    (item: { mediaType: MediaType; tmdbId: number }, refresh = false) => {
      const key = titleCacheKey(item)
      const cached = titleRequests.current.get(key)
      if (!refresh && cached && Date.now() - cached.at < 5 * 60 * 1000)
        return cached.promise
      const entry: TitleRequest = {
        promise: lookupTitle({
          mediaType: item.mediaType,
          tmdbId: item.tmdbId,
        }),
        at: Date.now(),
      }
      titleRequests.current.set(key, entry)
      if (titleRequests.current.size > 40)
        titleRequests.current.delete(titleRequests.current.keys().next().value!)
      void entry.promise
        .then((data) => {
          entry.data = data
        })
        .catch(() => {
          if (titleRequests.current.get(key) === entry)
            titleRequests.current.delete(key)
        })
      return entry.promise
    },
    [lookupTitle, titleCacheKey]
  )
  const cachedTitle = useCallback(
    (item: { mediaType: MediaType; tmdbId: number }) => {
      const entry = titleRequests.current.get(titleCacheKey(item))
      return entry && Date.now() - entry.at < 5 * 60 * 1000
        ? entry.data
        : undefined
    },
    [titleCacheKey]
  )
  const restoreOrigin = useCallback((origin: Origin) => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: origin.scrollY })
      if (origin.drawerScrollY !== null)
        document
          .querySelector(
            '[data-slot="drawer-popup"] [data-slot="scroll-area-viewport"]'
          )
          ?.scrollTo({ top: origin.drawerScrollY })
      const scope =
        origin.drawerScrollY === null
          ? document
          : document.querySelector('[data-slot="drawer-popup"]')
      const element = origin.element?.isConnected
        ? origin.element
        : [
            ...(scope?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? []),
          ].find(
            (link) =>
              link.getAttribute("href") === origin.focusHref &&
              link.getClientRects().length > 0
          )
      element?.focus({ preventScroll: true })
    })
  }, [])
  if (pendingTitle && pathname !== pendingTitle.origin.href.split(/[?#]/)[0])
    setPendingTitle(null)
  const entry = useSyncExternalStore(
    subscribeNavigation,
    () => {
      const key = navigationSnapshot()
      return key ? (origins.current.get(key) ?? null) : null
    },
    () => null
  )
  const searchOrigin = entry?.kind === "search" ? entry.origin : null
  const titleOrigin = entry?.kind === "title" ? entry.origin : null
  const drawerOrigin = entry?.kind === "title" ? (entry.drawer ?? null) : null
  const browsing =
    pathname === "/" ||
    pathname === "/discover" ||
    pathname.startsWith("/browse")

  useEffect(() => {
    const onPopState = () => {
      if (
        entry?.origin.href ===
        `${location.pathname}${location.search}${location.hash}`
      )
        returning.current = entry.origin
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [entry])

  useEffect(() => {
    const origin = returning.current
    if (origin && pathname === origin.href.split(/[?#]/)[0]) {
      returning.current = null
      restoreOrigin(origin)
    }
  }, [pathname, params, restoreOrigin])

  useLayoutEffect(() => {
    const next = pending.current
    if (
      !next ||
      (next.kind === "search"
        ? pathname !== "/search"
        : !/^\/(movie|tv)\//.test(pathname))
    )
      return
    pending.current = null
    const key = crypto.randomUUID()
    origins.current.set(key, next)
    window.history.replaceState(
      { ...window.history.state, showlistOrigin: key },
      ""
    )
    window.dispatchEvent(new Event("showlist:navigation"))
  }, [pathname])

  const typeParam = params.get("type")
  const query = (params.get("q") ?? "").slice(0, 200)
  const entity = readEntitySearch(params)
  const hasEntityParams = ["entity", "id", "name", "credit"].some((key) =>
    params.has(key)
  )
  const sortParam = params.get("sort")
  const entitySort: EntitySort =
    sortParam === "newest" ? "newest" : "popularity"
  const textSort: TitleSort =
    sortParam === "popularity" ||
    sortParam === "newest" ||
    sortParam === "rating" ||
    sortParam === "title"
      ? sortParam
      : "relevance"
  const orderParam = params.get("order")
  const order: SortOrder =
    orderParam === "asc" || orderParam === "desc"
      ? orderParam
      : defaultSortOrder(entity ? entitySort : textSort)
  const results = useTitleSearch(
    query,
    typeParam === "movie" || typeParam === "tv" ? typeParam : "all",
    isAuthenticated &&
      pathname === "/search" &&
      (!hasEntityParams || entity !== null) &&
      (params.get("scope") !== "library" || entity !== null) &&
      !(params.get("mode") === "describe" && aiConfigured && !hasEntityParams),
    entity,
    entitySort,
    textSort,
    order
  )
  const storageKey = `showlist:searches:${user?.id ?? ""}`
  const stored = useSyncExternalStore(
    subscribeRecent,
    () => {
      try {
        return localStorage.getItem(storageKey) ?? "[]"
      } catch {
        return "[]"
      }
    },
    () => "[]"
  )
  let recent: string[] = []
  try {
    const parsed: unknown = JSON.parse(stored)
    if (Array.isArray(parsed))
      recent = parsed
        .filter(
          (value): value is string =>
            typeof value === "string" && value.length > 0 && value.length <= 200
        )
        .slice(0, 6)
  } catch {}
  const saveRecent = (values: string[]) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(values))
      window.dispatchEvent(new Event("showlist:searches"))
    } catch {}
  }
  const rememberSearch = (value: string) => {
    const trimmed = value.trim().slice(0, 200)
    if (trimmed)
      saveRecent(
        [trimmed, ...recent.filter((item) => item !== trimmed)].slice(0, 6)
      )
  }

  return (
    <NavigationContext.Provider
      value={{
        searchOrigin,
        titleOrigin,
        drawerOrigin,
        returnToOrigin: (origin, depth = 1) => {
          returning.current = origin
          window.history.go(-depth)
        },
        captureSearchOrigin: () => {
          pending.current = { kind: "search", origin: currentOrigin() }
        },
        captureTitleOrigin: () => {
          const origin = currentOrigin()
          pending.current = {
            kind: "title",
            origin,
            drawer: browsing
              ? { origin, depth: 1 }
              : drawerOrigin
                ? { ...drawerOrigin, depth: drawerOrigin.depth + 1 }
                : undefined,
          }
          if (pathname === "/search") rememberSearch(query)
        },
        keepTitleOrigin: () => {
          const origin = browsing
            ? currentOrigin()
            : (titleOrigin ?? currentOrigin())
          pending.current = {
            kind: "title",
            origin,
            drawer: browsing
              ? { origin, depth: 1 }
              : (drawerOrigin ?? undefined),
          }
        },
        pendingTitle,
        prepareTitle: (item, drawer) => {
          if (drawer) setPendingTitle({ item, origin: currentOrigin() })
          if (isAuthenticated) void loadTitle(item).catch(() => {})
        },
        clearPendingTitle: () => {
          setPendingTitle(null)
          pending.current = null
        },
        loadTitle,
        cachedTitle,
        restoreOrigin,
        recent,
        rememberSearch,
        removeRecent: (value) =>
          saveRecent(recent.filter((item) => item !== value)),
        results,
        retained,
        userKey: user?.id ?? "signed-out",
      }}
    >
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigationState() {
  const context = useContext(NavigationContext)
  if (!context) throw new Error("NavigationProvider is required")
  return context
}

export function useRetainedState<T>(name: string, initial: T) {
  const { retained, userKey } = useNavigationState()
  const key = `${userKey}:${name}`
  const [state, setState] = useState(() => ({
    key,
    value: retained.has(key) ? (retained.get(key) as T) : initial,
  }))
  const value =
    state.key === key
      ? state.value
      : retained.has(key)
        ? (retained.get(key) as T)
        : initial
  if (state.key !== key) setState({ key, value })
  useEffect(() => {
    retained.set(key, value)
  }, [retained, key, value])
  const update = useCallback(
    (next: SetStateAction<T>) => {
      setState((previous) => ({
        key,
        value:
          typeof next === "function"
            ? (next as (value: T) => T)(previous.value)
            : next,
      }))
    },
    [key]
  )
  return [value, update] as const
}

export function useBrowseSearchParams() {
  const pathname = usePathname()
  const params = useSearchParams()
  const browsing =
    pathname === "/" ||
    pathname === "/discover" ||
    pathname === "/browse" ||
    pathname === "/browse/discover"
  const value = params.toString()
  const [saved, setSaved] = useState(value)
  if (browsing && saved !== value) setSaved(value)
  return new URLSearchParams(browsing ? value : saved)
}
