"use client"

import {
  ArrowLeft01Icon,
  ArrowLeftDoubleIcon,
  ArrowRight01Icon,
  PauseIcon,
  PlayIcon,
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
// rail that track the active page; with autoplay on, the active dash fills
// as a progress bar and a pause/play control sits at the right. When
// `autoAdvanceMs` is set, the rail advances one page on that interval while
// unhovered and tab-visible, wrapping to the first page with an instant cut
// (1→2→…→N→1→…). Any interaction pauses the slideshow (a control to resume
// is rendered with the dashes).
export function RailScroller({
  children,
  className,
  autoAdvanceMs,
  pagination = true,
  paged = false,
  controlsInset = false,
  paginationOverlay = false,
}: {
  children: React.ReactNode
  className?: string
  autoAdvanceMs?: number
  pagination?: boolean
  paged?: boolean
  controlsInset?: boolean
  paginationOverlay?: boolean
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(true)
  const [pageCount, setPageCount] = useState(0)
  const [activePage, setActivePage] = useState(0)
  const hoveredRef = useRef(false)
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  const setPausedBoth = useCallback((value: boolean) => {
    pausedRef.current = value
    setPaused(value)
  }, [])
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
    if (el.clientWidth === 0) return
    const pages = Math.max(
      1,
      paged
        ? el.children.length
        : Math.ceil((el.scrollWidth - 1) / el.clientWidth)
    )
    setPageCount(pages)
    setActivePage(
      el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
        ? pages - 1
        : Math.min(pages - 1, Math.round(el.scrollLeft / el.clientWidth))
    )
  }, [paged])

  useEffect(() => {
    const el = railRef.current
    if (el === null) return
    updateEnds()
    // Content size changes (skeletons → loaded cards) and window resizes
    // both change whether the rail overflows — recheck on either.
    const observer = new ResizeObserver(updateEnds)
    observer.observe(el)
    for (const child of el.children) observer.observe(child)
    return () => observer.disconnect()
  }, [updateEnds, children])

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
        pausedRef.current
      ) {
        return
      }
      if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 1) {
        // Wrap: cut straight back to slide 1 — no backward sweep.
        el.scrollTo({ left: 0, behavior: "auto" })
      } else {
        el.scrollBy({
          left: el.clientWidth,
          behavior: "smooth",
        })
      }
    }, autoAdvanceMs)
    const wrapper = wrapperRef.current
    // Any real interaction with the strip pauses the slideshow — the
    // pause/play control itself is exempt so it can resume it. Scrolling
    // the PAGE over the strip (vertical wheel, vertical touch swipe) does
    // NOT count — only horizontal intent does.
    const markInteracted = (e: Event) => {
      if (
        e.target instanceof Element &&
        e.target.closest("[data-autoplay-control]") !== null
      ) {
        return
      }
      if (e instanceof WheelEvent && Math.abs(e.deltaX) <= Math.abs(e.deltaY)) {
        return
      }
      setPausedBoth(true)
    }
    let touchStart: { x: number; y: number } | null = null
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      touchStart = t === undefined ? null : { x: t.clientX, y: t.clientY }
    }
    const onTouchMove = (e: TouchEvent) => {
      if (touchStart === null) return
      const t = e.touches[0]
      if (t === undefined) return
      const dx = t.clientX - touchStart.x
      const dy = t.clientY - touchStart.y
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
        markInteracted(e)
      }
    }
    wrapper?.addEventListener("pointerdown", markInteracted)
    wrapper?.addEventListener("wheel", markInteracted, { passive: true })
    wrapper?.addEventListener("keydown", markInteracted)
    wrapper?.addEventListener("touchstart", onTouchStart, { passive: true })
    wrapper?.addEventListener("touchmove", onTouchMove, { passive: true })
    return () => {
      window.clearInterval(timer)
      wrapper?.removeEventListener("pointerdown", markInteracted)
      wrapper?.removeEventListener("wheel", markInteracted)
      wrapper?.removeEventListener("keydown", markInteracted)
      wrapper?.removeEventListener("touchstart", onTouchStart)
      wrapper?.removeEventListener("touchmove", onTouchMove)
    }
  }, [autoAdvanceMs, scrollBehavior, setPausedBoth])

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

  // Rewind to slide 1: an instant cut — the icon says "restart", so no
  // backward glide through the pages in between.
  const rewindToStart = () => {
    const el = railRef.current
    if (el === null) return
    el.scrollTo({ left: 0, behavior: "auto" })
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
        className={cn(arrowClass, controlsInset ? "left-3" : "-left-4")}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} />
      </button>
      <button
        type="button"
        aria-label={atEnd ? "Rewind to the first slide" : "Scroll right"}
        disabled={atStart && atEnd}
        onClick={() => {
          if (atEnd) {
            rewindToStart()
          } else {
            nudge(1)
          }
        }}
        className={cn(arrowClass, controlsInset ? "right-3" : "-right-4")}
      >
        {/* The control never disappears: at the end it becomes a rewind
            (double-left) that returns to the first slide. */}
        <HugeiconsIcon icon={atEnd ? ArrowLeftDoubleIcon : ArrowRight01Icon} />
      </button>
      {pagination && (
        <div
          className={cn(
            "flex min-h-8 items-center justify-center gap-2",
            paginationOverlay ? "absolute inset-x-0 bottom-3" : "mt-2.5"
          )}
        >
          {pageCount > 1 && (
            <>
              <div className="flex h-8 items-center gap-1.5 rounded-full bg-black/60 px-3 backdrop-blur">
                {Array.from({ length: pageCount }, (_, i) => {
                  const active = activePage === i
                  const animating =
                    active && autoAdvanceMs !== undefined && !paused
                  return (
                    <button
                      key={i}
                      type="button"
                      aria-label={`Go to slide ${i + 1} of ${pageCount}`}
                      aria-current={active}
                      onClick={() => {
                        const el = railRef.current
                        if (el === null) return
                        el.scrollTo({
                          left: i * el.clientWidth,
                          behavior: scrollBehavior,
                        })
                      }}
                      className="group/dot -m-1.5 flex cursor-pointer items-center justify-center p-1.5"
                    >
                      <span
                        className={cn(
                          "relative block overflow-hidden rounded-full transition-all",
                          active
                            ? animating
                              ? "h-1.5 w-8 bg-white/25"
                              : "h-1.5 w-8 bg-white"
                            : "size-1.5 bg-white/40 group-hover/dot:bg-white/70"
                        )}
                      >
                        {animating &&
                          autoAdvanceMs !== undefined &&
                          scrollBehavior === "smooth" && (
                            <span
                              aria-hidden
                              className="absolute inset-y-0 left-0 rounded-full bg-white group-hover/rail:[animation-play-state:paused]"
                              style={{
                                animation: `rail-progress ${autoAdvanceMs}ms linear forwards`,
                              }}
                            />
                          )}
                      </span>
                    </button>
                  )
                })}
              </div>
              {autoAdvanceMs !== undefined && scrollBehavior === "smooth" && (
                <button
                  type="button"
                  data-autoplay-control
                  aria-label={paused ? "Resume slideshow" : "Pause slideshow"}
                  aria-pressed={paused}
                  onClick={() => setPausedBoth(!paused)}
                  className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-colors hover:bg-black/75"
                >
                  <HugeiconsIcon
                    icon={paused ? PlayIcon : PauseIcon}
                    className="size-3.5"
                  />
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
