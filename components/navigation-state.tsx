"use client"

import { useUser } from "@clerk/nextjs"
import { useConvexAuth } from "convex/react"
import { usePathname, useSearchParams } from "next/navigation"
import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  type SetStateAction,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { useTitleSearch } from "@/components/use-title-search"
import { useAiConfig } from "@/lib/ai"

type Origin = {
  href: string
  scrollY: number
  element: HTMLElement | null
}

function currentOrigin(): Origin {
  return {
    href: `${location.pathname}${location.search}${location.hash}`,
    scrollY: window.scrollY,
    element:
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null,
  }
}

type EntryOrigin = { kind: "search" | "title"; origin: Origin }

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
  captureSearchOrigin: () => void
  captureTitleOrigin: () => void
  keepTitleOrigin: () => void
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

  useEffect(() => {
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
  const results = useTitleSearch(
    query,
    typeParam === "movie" || typeParam === "tv" ? typeParam : "all",
    isAuthenticated &&
      pathname === "/search" &&
      params.get("scope") !== "library" &&
      !(params.get("mode") === "describe" && aiConfigured)
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
        captureSearchOrigin: () => {
          pending.current = { kind: "search", origin: currentOrigin() }
        },
        captureTitleOrigin: () => {
          pending.current = { kind: "title", origin: currentOrigin() }
          if (pathname === "/search") rememberSearch(query)
        },
        keepTitleOrigin: () => {
          pending.current = {
            kind: "title",
            origin: titleOrigin ?? currentOrigin(),
          }
        },
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
