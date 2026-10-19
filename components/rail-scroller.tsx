"use client"

import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { cn } from "@/lib/utils"

// Netflix-style horizontal rail: content scrolls natively (touch swipe,
// trackpad) with the scrollbar hidden, and desktop gets chevron buttons at
// the edges for mouse-driven paging. The buttons sit in the page gutter so
// they barely cover the cards. Mobile keeps pure swipe — the chevrons only
// render from lg up.
//
// `className` extends the inner scroller (e.g. snap classes for paging
// rails). `loop` keeps both chevrons enabled and wraps at the ends. When
// `autoAdvanceMs` is set the rail advances one page on that interval while
// untouched, unhovered and tab-visible — the first pointer/wheel/key
// interaction stops the autoplay for good (the Netflix billboarding rule).
export function RailScroller({
  children,
  className,
  loop = false,
  autoAdvanceMs,
}: {
  children: React.ReactNode
  className?: string
  loop?: boolean
  autoAdvanceMs?: number
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(true)
  const hoveredRef = useRef(false)
  const interactedRef = useRef(false)

  const updateEnds = useCallback(() => {
    const el = railRef.current
    if (el === null) return
    setAtStart(el.scrollLeft <= 0)
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    const el = railRef.current
    if (el === null) return
    updateEnds()
    // Content size changes (skeletons → loaded cards) and window resizes
    // both change whether the rail overflows — recheck on either.
    const observer = new ResizeObserver(updateEnds)
    observer.observe(el)
    return () => observer.disconnect()
  }, [updateEnds])

  const scrollBehavior: ScrollBehavior = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    []
  )

  const nudge = (direction: 1 | -1) => {
    const el = railRef.current
    if (el === null) return
    if (loop && direction === 1 && atEnd) {
      el.scrollTo({ left: 0, behavior: scrollBehavior })
    } else if (loop && direction === -1 && atStart) {
      el.scrollTo({ left: el.scrollWidth, behavior: scrollBehavior })
    } else {
      el.scrollBy({
        left: direction * el.clientWidth * 0.85,
        behavior: scrollBehavior,
      })
    }
  }

  // Billboard autoplay — see the header comment. Skipped entirely for
  // reduced-motion users (scrollBehavior "auto" is the tell).
  useEffect(() => {
    if (autoAdvanceMs === undefined || scrollBehavior !== "smooth") {
      return
    }
    const timer = window.setInterval(() => {
      const el = railRef.current
      if (
        el === null ||
        document.hidden ||
        hoveredRef.current ||
        interactedRef.current
      ) {
        return
      }
      if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 1) {
        el.scrollTo({ left: 0, behavior: "smooth" })
      } else {
        el.scrollBy({ left: el.clientWidth, behavior: "smooth" })
      }
    }, autoAdvanceMs)
    const wrapper = wrapperRef.current
    const markInteracted = () => {
      interactedRef.current = true
    }
    wrapper?.addEventListener("pointerdown", markInteracted)
    wrapper?.addEventListener("wheel", markInteracted, { passive: true })
    wrapper?.addEventListener("touchstart", markInteracted, { passive: true })
    wrapper?.addEventListener("keydown", markInteracted)
    return () => {
      window.clearInterval(timer)
      wrapper?.removeEventListener("pointerdown", markInteracted)
      wrapper?.removeEventListener("wheel", markInteracted)
      wrapper?.removeEventListener("touchstart", markInteracted)
      wrapper?.removeEventListener("keydown", markInteracted)
    }
  }, [autoAdvanceMs, scrollBehavior])

  const arrowClass =
    "absolute top-1/2 z-10 hidden size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border bg-background/90 shadow-sm backdrop-blur transition-opacity hover:bg-accent disabled:pointer-events-none disabled:opacity-0 lg:flex"

  return (
    <div
      ref={wrapperRef}
      onMouseEnter={() => {
        hoveredRef.current = true
      }}
      onMouseLeave={() => {
        hoveredRef.current = false
      }}
      className="group/rail relative"
    >
      <div
        ref={railRef}
        onScroll={updateEnds}
        className={cn(
          "hide-scrollbar flex gap-4 overflow-x-auto pb-2",
          className
        )}
      >
        {children}
      </div>
      <button
        type="button"
        aria-label="Scroll left"
        disabled={loop ? false : atStart}
        onClick={() => nudge(-1)}
        className={cn(arrowClass, "-left-4")}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} />
      </button>
      <button
        type="button"
        aria-label="Scroll right"
        disabled={loop ? false : atEnd}
        onClick={() => nudge(1)}
        className={cn(arrowClass, "-right-4")}
      >
        <HugeiconsIcon icon={ArrowRight01Icon} />
      </button>
    </div>
  )
}
