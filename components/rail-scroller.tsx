"use client"

import {
  ArrowLeft01Icon,
  ArrowLeftDoubleIcon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { cn } from "@/lib/utils"

// Netflix-style horizontal rail: content scrolls natively (touch swipe,
// trackpad) with the scrollbar hidden, and desktop gets chevron buttons at
// the edges for mouse-driven paging. Mouse users can also grab and drag the
// rail itself — a 5px threshold keeps ordinary clicks untouched; on `paged`
// rails (the hero) a deliberate drag flips a whole page instead of
// rubber-banding back. Buttons sit in the page gutter and fade out at the
// ends — no wrap-jump. Mobile keeps pure swipe — chevrons only render from
// lg up.
//
// `className` extends the inner scroller (e.g. snap classes for paging
// rails). `pagination` (on by default) renders clickable dashes below the
// rail that track the active page. When `autoAdvanceMs` is set, the rail
// advances one page on that interval while untouched, unhovered and
// tab-visible — ping-ponging at the ends (1→2→…→N→N-1→…) instead of an
// animated rewind. The first pointer/wheel/key interaction stops the
// autoplay for good (the Netflix billboarding rule).
export function RailScroller({
  children,
  className,
  autoAdvanceMs,
  pagination = true,
  paged = false,
}: {
  children: React.ReactNode
  className?: string
  autoAdvanceMs?: number
  pagination?: boolean
  paged?: boolean
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(true)
  const [pageCount, setPageCount] = useState(0)
  const [activePage, setActivePage] = useState(0)
  const hoveredRef = useRef(false)
  const interactedRef = useRef(false)
  const directionRef = useRef(1)
  const dragRef = useRef<{
    startX: number
    startScroll: number
    pointerId: number
    dragged: boolean
    lastDx: number
  } | null>(null)

  const scrollBehavior: ScrollBehavior = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    []
  )

  const updateEnds = useCallback(() => {
    const el = railRef.current
    if (el === null) return
    setAtStart(el.scrollLeft <= 0)
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1)
    const pages = Math.max(1, Math.round(el.scrollWidth / el.clientWidth))
    setPageCount(pages)
    setActivePage(
      Math.min(pages - 1, Math.round(el.scrollLeft / el.clientWidth))
    )
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
    el.scrollBy({
      left: direction * el.clientWidth * 0.85,
      behavior: scrollBehavior,
    })
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
        directionRef.current = -1
      } else if (el.scrollLeft <= 0) {
        directionRef.current = 1
      }
      el.scrollBy({
        left: directionRef.current * el.clientWidth,
        behavior: "smooth",
      })
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

  // Mouse grab-to-scroll: pointerdown records the start; once the pointer
  // moves 5px we capture it and translate movement into scrollLeft, so
  // ordinary clicks stay clicks (the capture also retargets the post-drag
  // click at the rail, suppressing accidental drawer opens). Touch is left
  // to native scrolling.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return
    const el = railRef.current
    if (el === null) return
    dragRef.current = {
      startX: e.clientX,
      startScroll: el.scrollLeft,
      pointerId: e.pointerId,
      dragged: false,
      lastDx: 0,
    }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    const el = railRef.current
    if (drag === null || el === null || drag.pointerId !== e.pointerId) return
    const dx = e.clientX - drag.startX
    drag.lastDx = dx
    if (!drag.dragged && Math.abs(dx) > 5) {
      drag.dragged = true
      el.setPointerCapture(e.pointerId)
    }
    if (drag.dragged) {
      e.preventDefault()
      el.scrollLeft = drag.startScroll - dx
    }
  }
  // On paged rails a deliberate drag flips a whole page — mandatory snap
  // alone would rubber-band short drags back to the current slide.
  const onPointerEnd = () => {
    const drag = dragRef.current
    const el = railRef.current
    dragRef.current = null
    if (drag === null || el === null || !drag.dragged || !paged) return
    const pageWidth = el.clientWidth
    if (Math.abs(drag.lastDx) < pageWidth * 0.1) return
    const base = Math.round(drag.startScroll / pageWidth) * pageWidth
    const target = base + (drag.lastDx < 0 ? pageWidth : -pageWidth)
    const max = el.scrollWidth - el.clientWidth
    el.scrollTo({
      left: Math.max(0, Math.min(max, target)),
      behavior: scrollBehavior,
    })
  }

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
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onDragStart={(e) => e.preventDefault()}
        className={cn(
          "hide-scrollbar flex gap-4 overflow-x-auto pb-2 select-none",
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
        aria-label={atEnd ? "Rewind one page" : "Scroll right"}
        onClick={() => nudge(atEnd ? -1 : 1)}
        className={cn(arrowClass, "-right-4")}
      >
        {/* The control never disappears: at the end it becomes a rewind
            (double-left) so the rail can always be driven back manually. */}
        <HugeiconsIcon icon={atEnd ? ArrowLeftDoubleIcon : ArrowRight01Icon} />
      </button>
      {pagination && pageCount > 1 && (
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          {Array.from({ length: pageCount }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to slide ${i + 1} of ${pageCount}`}
              aria-current={activePage === i}
              onClick={() => {
                const el = railRef.current
                if (el === null) return
                el.scrollTo({
                  left: i * el.clientWidth,
                  behavior: scrollBehavior,
                })
              }}
              className={cn(
                "h-1 cursor-pointer rounded-full transition-all",
                activePage === i
                  ? "w-6 bg-foreground"
                  : "w-3 bg-muted-foreground/40 hover:bg-muted-foreground/70"
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}
