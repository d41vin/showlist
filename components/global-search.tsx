"use client"

import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef } from "react"
import { useNavigationState } from "@/components/navigation-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { replaceSearchUrl } from "@/lib/navigation"

export function GlobalSearch() {
  const pathname = usePathname()
  const params = useSearchParams()
  const router = useRouter()
  const { searchOrigin, captureSearchOrigin, rememberSearch } =
    useNavigationState()
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closing = useRef(false)
  const closingOrigin = useRef(searchOrigin)
  const active = pathname === "/search"
  const query = (params.get("q") ?? "").slice(0, 200)

  const openSearch = () => {
    if (active) {
      inputRef.current?.focus()
      return
    }
    captureSearchOrigin()
    router.push("/search")
  }
  const closeSearch = () => {
    rememberSearch(query)
    closing.current = true
    closingOrigin.current = searchOrigin
    if (searchOrigin) router.back()
    else router.replace("/")
  }

  useEffect(() => {
    if (active) inputRef.current?.focus({ preventScroll: true })
    else if (closing.current) {
      closing.current = false
      triggerRef.current?.focus({ preventScroll: true })
      if (closingOrigin.current)
        window.scrollTo({ top: closingOrigin.current.scrollY })
    }
  }, [active])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        if (document.querySelector('[role="dialog"]')) return
        event.preventDefault()
        if (active) inputRef.current?.focus()
        else triggerRef.current?.click()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [active])

  if (!active)
    return (
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon-sm"
        onClick={openSearch}
        aria-label="Search movies and TV"
        aria-keyshortcuts="Control+k Meta+k"
      >
        <HugeiconsIcon icon={Search01Icon} />
      </Button>
    )

  return (
    <form
      role="search"
      className="relative w-full lg:w-72"
      onSubmit={(event) => {
        event.preventDefault()
        rememberSearch(query)
      }}
    >
      <HugeiconsIcon
        icon={Search01Icon}
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        ref={inputRef}
        id="navbar-search"
        type="text"
        inputMode="search"
        autoComplete="off"
        value={query}
        maxLength={200}
        aria-label="Search movies, TV and your library"
        placeholder="Search movies & TV…"
        className="pr-10 pl-9"
        onChange={(event) => {
          const next = new URLSearchParams(params.toString())
          if (event.target.value) next.set("q", event.target.value)
          else next.delete("q")
          next.delete("mode")
          replaceSearchUrl(next)
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.nativeEvent.isComposing) {
            event.preventDefault()
            closeSearch()
          }
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute top-1/2 right-1 -translate-y-1/2"
        aria-label="Close search"
        onClick={closeSearch}
      >
        <HugeiconsIcon icon={Cancel01Icon} />
      </Button>
    </form>
  )
}
