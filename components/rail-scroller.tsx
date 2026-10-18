"use client"

import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useCallback, useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

// Netflix-style horizontal rail: content scrolls natively (touch swipe,
// trackpad) with the scrollbar hidden, and desktop gets chevron buttons at
// the edges for mouse-driven paging. The buttons sit in the page gutter so
// they barely cover the cards, and disable (fade out) at either end of the
// rail. Mobile keeps pure swipe — the chevrons only render from lg up.
// `className` extends the inner scroller (e.g. snap classes for paging
// rails like the hero).
export function RailScroller({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const railRef = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(true)

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

  const nudge = (direction: 1 | -1) => {
    const el = railRef.current
    if (el === null) return
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: "smooth" })
  }

  const arrowClass =
    "absolute top-1/2 z-10 hidden size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border bg-background/90 shadow-sm backdrop-blur transition-opacity hover:bg-accent disabled:pointer-events-none disabled:opacity-0 lg:flex"

  return (
    <div className="group/rail relative">
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
        disabled={atStart}
        onClick={() => nudge(-1)}
        className={cn(arrowClass, "-left-4")}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} />
      </button>
      <button
        type="button"
        aria-label="Scroll right"
        disabled={atEnd}
        onClick={() => nudge(1)}
        className={cn(arrowClass, "-right-4")}
      >
        <HugeiconsIcon icon={ArrowRight01Icon} />
      </button>
    </div>
  )
}
