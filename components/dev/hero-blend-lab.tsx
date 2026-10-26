"use client"

import { Cancel01Icon, PlayIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useAction } from "convex/react"
import Image from "next/image"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import type { Ref } from "react"

import { RailScroller } from "@/components/rail-scroller"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { api } from "@/convex/_generated/api"
import { tmdbBackdropUrl, tmdbLogoUrl } from "@/lib/media"
import { cn } from "@/lib/utils"

// Copied from components/title-details.tsx so the lab crops exactly like the
// real drawer hero.
const BACKDROP_ASPECT = 16 / 9
const HERO_CROP_Y = 0.38
const BLEED_MASK =
  "linear-gradient(to bottom, black 0%, black 45%, transparent 100%)"
const GLASS_MASK =
  "linear-gradient(to bottom, black 0%, black 55%, transparent 100%)"
// Option A (corrected): artwork dies away while the frost builds to solid.
const BLEED_MASK_SOFT =
  "linear-gradient(to bottom, black 0%, rgba(0,0,0,0.72) 38%, transparent 86%)"
const GLASS_MASK_IN =
  "linear-gradient(to bottom, transparent 0%, black 58%, black 100%)"
// Frost values match the app's established translucent recipe —
// backdrop-blur-2xl + backdrop-saturate-150 (ui/drawer.tsx swipe handle,
// ui/dropdown-menu.tsx content, hero buttons) with a popover tint. Applied on
// the masked element itself, because a masked ancestor would otherwise become
// the backdrop root and starve the blur of anything to sample.
// Variant C: the image is not zoomed. The hero box is 95% of the natural 16:9
// height, bottom-aligned, so only the top 5% is cropped.
const C_HERO_CROP = 0.05
// Div 1 of variant C: transparent at the top, the drawer's own colour at the
// bottom, so the image lands on the background instead of being cut off.
const BG_RAMP = "linear-gradient(to bottom, transparent, var(--color-popover))"
// C2: the same ramp, but confined to the strip so nothing below the boundary
// carries a backdrop-filter surface.
const FROST_RAMP_STRIP = "linear-gradient(to bottom, transparent, black 100%)"

type Variant = "a0" | "a1" | "b" | "c0" | "c1" | "c2" | "c3"

const VARIANTS: { id: Variant; label: string; note: string }[] = [
  {
    id: "a0",
    label: "A · as shipped",
    note: "The current drawer, warts and all: the artwork band fades out to nothing, and the fixture scrollbar sits under the band because the band lives inside the z-10 content wrapper.",
  },
  {
    id: "a1",
    label: "A · corrected",
    note: "Same repainted artwork, but the artwork fades out while the frost fades in to solid popover, so the band ends on the exact content colour. Scrollbar lifted to z-30 (the one-line fix in ui/scroll-area.tsx).",
  },
  {
    id: "b",
    label: "B · raised panel",
    note: "No repainted artwork. The content's own frost panel is lifted over the last 35px of the hero — the real backdrop pixels blur through it — and fades out below the boundary. Same z-30 scrollbar.",
  },
  {
    id: "c0",
    label: "C · as proposed",
    note: "Uncropped hero (95% height, top-5% crop), gradient div under a full-height frosted content panel raised 100px. Shows the problem: the frost has a hard top edge over the image.",
  },
  {
    id: "c1",
    label: "C1 · frost ramped in",
    note: "Same stack, but the frost layer is masked so its tint and blur ramp from 0% to full across exactly the 100px overlap. Nothing abrupt at the top, and below the boundary the tint sits on the colour it already matches.",
  },
  {
    id: "c2",
    label: "C2 · frost only in the overlap",
    note: "The ramped frost is confined to the 100px strip over the image; the rest of the content keeps the plain drawer background. Same look as C1 where it matters, far smaller backdrop-filter surface.",
  },
  {
    id: "c3",
    label: "C3 · gradient only",
    note: "Drop the glass entirely: the raised panel keeps the plain background and only the transparent → popover gradient bridges the last 100px of the image. Cheapest, no blur edge at all.",
  },
]

type LabTitle = {
  name: string
  year: string | null
  mediaType: "movie" | "tv"
  facts: string[]
  overview: string
  logoPath: string | null
  backdrops: string[]
  trailerKey: string | null
  trailerName: string
}

export function HeroBlendLab() {
  const [mediaType, setMediaType] = useState<"movie" | "tv">("movie")
  const [tmdbId, setTmdbId] = useState(1236045)
  const [overlap, setOverlap] = useState(35)
  const [cOverlap, setCOverlap] = useState(100)
  const [glass, setGlass] = useState(70)
  const [frost, setFrost] = useState(180)
  const [edges, setEdges] = useState(false)
  const [family, setFamily] = useState<"all" | "a" | "b" | "c">("all")
  const [data, setData] = useState<LabTitle | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const lookupTitle = useAction(api.tmdb.title)
  const lookupExtras = useAction(api.tmdb.titleExtras)
  const lookupVideos = useAction(api.tmdb.videos)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setStatus("Loading title…")
      // The Clerk token can still be warming up when this dev route mounts, and
      // the Convex actions reject with "Not signed in" for a moment.
      const loadTitle = async () => {
        for (let attempt = 0; ; attempt += 1) {
          try {
            return await lookupTitle({ mediaType, tmdbId })
          } catch (error) {
            const message = error instanceof Error ? error.message : ""
            if (attempt >= 5 || !message.includes("Not signed in")) throw error
            await new Promise((resolve) => setTimeout(resolve, 1000))
          }
        }
      }
      try {
        const payload = await loadTitle()
        if (!payload) {
          if (!cancelled) setStatus("TMDB has no title with that id.")
          return
        }
        const [extras, videos] = await Promise.all([
          lookupExtras({ mediaType, tmdbId }).catch(() => null),
          lookupVideos({ mediaType, tmdbId }).catch(() => null),
        ])
        if (cancelled) return
        const details = payload.details
        const facts = [
          payload.item.mediaType === "movie" ? "Movie" : "Show",
          payload.item.year ?? "—",
          details.voteAverage !== null
            ? `TMDB ${details.voteAverage.toFixed(1)}/10`
            : null,
          details.runtime !== null && details.runtime > 0
            ? `${details.runtime} min`
            : null,
        ].filter((fact): fact is string => fact !== null)
        setData({
          name: payload.item.title,
          year: payload.item.year,
          mediaType: payload.item.mediaType,
          facts,
          overview:
            details.overview ??
            "This title has no overview on TMDB, so the paragraph below is filler to give the panel something to scroll.",
          logoPath: details.logoPath,
          backdrops: [
            ...new Set(
              [details.backdropPath, ...(extras?.backdrops ?? [])].filter(
                (path): path is string => Boolean(path)
              )
            ),
          ].slice(0, 10),
          trailerKey: videos?.key ?? null,
          trailerName: videos?.name ?? "Trailer",
        })
        setStatus(null)
      } catch (error) {
        if (!cancelled)
          setStatus(
            error instanceof Error ? error.message : "Could not load the title."
          )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mediaType, tmdbId, lookupTitle, lookupExtras, lookupVideos])

  return (
    <main className="w-full pb-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 pt-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">Hero → content blend lab</h1>
          <p className="text-sm text-muted-foreground">
            Development-only comparison of the boundary treatments. Each panel
            is built like the real drawer: same popup background, radius and
            border, same <code>ScrollArea</code> with its overlay scrollbar. A
            and B crop the backdrop like the drawer does (38% down); the C
            family shows the image uncropped at 95% of its natural height with
            the top 5% pushed past the edge. The pale strip pinned to the right
            edge of every panel stands in for the drawer scrollbar, which only
            mounts in a tab that paints. Nothing here is wired into the app.
          </p>
        </header>

        <div className="flex flex-wrap items-end gap-x-6 gap-y-4 rounded-xl border border-border/60 p-4">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Type
            <select
              value={mediaType}
              onChange={(event) =>
                setMediaType(event.target.value === "tv" ? "tv" : "movie")
              }
              className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
            >
              <option value="movie">movie</option>
              <option value="tv">tv</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            TMDB id
            <input
              type="number"
              value={tmdbId}
              min={1}
              onChange={(event) =>
                setTmdbId(Math.max(1, Number(event.target.value) || 1))
              }
              className="w-28 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            A/B overlap · {overlap}px
            <input
              type="range"
              min={16}
              max={120}
              value={overlap}
              onChange={(event) => setOverlap(Number(event.target.value))}
              className="w-40 accent-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            C overlap · {cOverlap}px
            <input
              type="range"
              min={40}
              max={220}
              value={cOverlap}
              onChange={(event) => setCOverlap(Number(event.target.value))}
              className="w-40 accent-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Compare
            <select
              value={family}
              onChange={(event) =>
                setFamily(event.target.value as "all" | "a" | "b" | "c")
              }
              className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
            >
              <option value="all">everything</option>
              <option value="a">A only</option>
              <option value="b">B only</option>
              <option value="c">C family only</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Frost tint · {glass}% popover
            <input
              type="range"
              min={30}
              max={95}
              value={glass}
              onChange={(event) => setGlass(Number(event.target.value))}
              className="w-40 accent-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            B panel height below hero · {frost}px
            <input
              type="range"
              min={60}
              max={400}
              value={frost}
              onChange={(event) => setFrost(Number(event.target.value))}
              className="w-40 accent-primary"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={edges}
              onChange={(event) => setEdges(event.target.checked)}
              className="size-4 accent-primary"
            />
            Show layer edges
          </label>
        </div>

        {status && (
          <p role="status" className="text-sm text-muted-foreground">
            {status}
          </p>
        )}

        {data && (
          <div className="grid gap-6 xl:grid-cols-2 2xl:grid-cols-3">
            {VARIANTS.filter(
              (variant) =>
                family === "all" ||
                (family === "c"
                  ? variant.id.startsWith("c")
                  : variant.id === family)
            ).map((variant) => (
              <figure key={variant.id} className="flex flex-col gap-2">
                <figcaption className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{variant.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {variant.note}
                  </span>
                </figcaption>
                <LabPanel
                  variant={variant.id}
                  title={data}
                  overlap={variant.id.startsWith("c") ? cOverlap : overlap}
                  glass={glass}
                  frost={frost}
                  edges={edges}
                />
              </figure>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function LabPanel({
  variant,
  title,
  overlap,
  glass,
  frost,
  edges,
}: {
  variant: Variant
  title: LabTitle
  overlap: number
  glass: number
  frost: number
  edges: boolean
}) {
  const heroRef = useRef<HTMLDivElement>(null)
  const bleedRailRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const heroScroll = useRef(0)
  const [heroSize, setHeroSize] = useState<{
    width: number
    height: number
  } | null>(null)
  const [playing, setPlaying] = useState(false)

  const syncBleed = useCallback((scrollLeft: number) => {
    heroScroll.current = scrollLeft
    const rail = bleedRailRef.current
    if (rail !== null) {
      rail.style.transform = `translate3d(${-scrollLeft}px, 0, 0)`
    }
  }, [])

  useEffect(() => {
    const el = heroRef.current
    if (el === null) return
    const update = () => {
      const width = el.clientWidth
      const height = el.clientHeight
      if (width === 0 || height === 0) return
      setHeroSize((current) =>
        current?.width === width && current.height === height
          ? current
          : { width, height }
      )
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    window.addEventListener("resize", update)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", update)
    }
  }, [])

  const needsArtwork = variant === "a0" || variant === "a1"
  const artwork = (() => {
    if (!needsArtwork || heroSize === null || title.backdrops.length === 0)
      return null
    const renderedHeight = heroSize.width / BACKDROP_ASPECT
    const overflow = renderedHeight - heroSize.height
    if (overflow <= 1) return null
    const visibleTop = overflow * HERO_CROP_Y + heroSize.height
    const height = Math.min(overlap, renderedHeight - visibleTop)
    return {
      width: heroSize.width,
      height,
      objectPosition: (visibleTop / (renderedHeight - height)) * 100,
    }
  })()

  useLayoutEffect(() => {
    syncBleed(heroScroll.current)
  }, [syncBleed, artwork?.width, artwork?.height, playing, variant])

  const tint = `color-mix(in oklab, var(--color-popover) ${glass}%, transparent)`
  const edge = edges
    ? "outline outline-1 -outline-offset-1 outline-red-500/50"
    : ""
  // Variant B: the frost panel starts `overlap` px above the content edge, so
  // the mask peaks exactly at the hero boundary and dies away below it.
  const panelHeight = overlap + frost
  const heroEdgePct = (overlap / panelHeight) * 100
  const raisedMask = `linear-gradient(to bottom, transparent 0%, black ${heroEdgePct.toFixed(1)}%, black ${(heroEdgePct + 10).toFixed(1)}%, transparent 100%)`
  // C1: the glass reaches full strength right where the image ends.
  const frostRamp = `linear-gradient(to bottom, transparent 0px, black ${overlap}px, black 100%)`

  return (
    <div
      data-lab-panel={variant}
      className="relative flex h-[85vh] min-h-[560px] w-full flex-col overflow-hidden rounded-4xl border border-popover bg-popover text-sm text-popover-foreground shadow-xl"
    >
      <ScrollArea
        className="min-h-0 w-full min-w-0 flex-1"
        viewportRef={scrollRef}
      >
        <div ref={heroRef} className="relative w-full bg-muted">
          <div
            className={playing ? "invisible" : undefined}
            aria-hidden={playing}
            inert={playing}
          >
            <RailScroller
              paged
              controlsInset
              paginationOverlay
              onRailScroll={syncBleed}
              className="snap-x snap-mandatory gap-0 pb-0"
            >
              {title.backdrops.map((path, index) => (
                <div
                  key={path}
                  className="relative w-full min-w-0 shrink-0 snap-start"
                  style={
                    variant.startsWith("c")
                      ? // 95% of the natural 16:9 height: the top 5% is cropped,
                        // the bottom is not, and nothing is zoomed.
                        {
                          aspectRatio: `16 / ${(9 * (1 - C_HERO_CROP)).toFixed(2)}`,
                        }
                      : {
                          height: "clamp(15rem,38vw,28.125rem)",
                          maxHeight: "55dvh",
                        }
                  }
                >
                  <Image
                    src={tmdbBackdropUrl(path, "w1280")}
                    alt={
                      index === 0
                        ? `Featured artwork for ${title.name}`
                        : `Backdrop artwork ${index + 1} for ${title.name}`
                    }
                    fill
                    loading={index === 0 ? "eager" : "lazy"}
                    sizes="40vw"
                    className={cn(
                      "object-cover",
                      variant.startsWith("c")
                        ? "object-bottom"
                        : "object-[50%_38%]"
                    )}
                  />
                </div>
              ))}
            </RailScroller>
          </div>
          {playing && title.trailerKey && (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${title.trailerKey}?autoplay=1&rel=0`}
              title={`${title.name}: ${title.trailerName}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="absolute inset-0 size-full bg-black"
            />
          )}
          {title.logoPath && !playing && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/55 via-black/20 to-transparent pt-12 pb-8">
              <div className="mx-auto flex w-full max-w-2xl px-6">
                <Image
                  src={tmdbLogoUrl(title.logoPath)}
                  alt={title.name}
                  width={200}
                  height={80}
                  sizes="200px"
                  className="max-h-10 w-auto max-w-[50%] object-contain drop-shadow-lg"
                />
              </div>
            </div>
          )}
        </div>

        <div
          className="relative z-10"
          style={
            variant.startsWith("c") && !playing ? { top: -overlap } : undefined
          }
        >
          {variant.startsWith("c") && !playing && (
            <>
              {/* Div 1: transparent over the image, landing on the drawer colour
                  exactly at the hero boundary. */}
              <div
                aria-hidden
                data-boundary="gradient"
                className={cn(
                  "pointer-events-none absolute inset-x-0 top-0 z-0",
                  edge
                )}
                style={{ height: overlap, backgroundImage: BG_RAMP }}
              />
              {/* Div 2: the established translucent effect. c0 leaves its top
                  edge hard, c1/c2 mask it so the glass ramps in over the
                  overlap instead of switching on. */}
              {(variant === "c0" || variant === "c1") && (
                <div
                  aria-hidden
                  data-boundary="frost"
                  className={cn(
                    "pointer-events-none absolute inset-0 z-[1] backdrop-blur-2xl backdrop-saturate-150",
                    edge
                  )}
                  style={{
                    backgroundColor: tint,
                    ...(variant === "c1"
                      ? {
                          maskImage: frostRamp,
                          WebkitMaskImage: frostRamp,
                        }
                      : null),
                  }}
                />
              )}
              {variant === "c2" && (
                <div
                  aria-hidden
                  data-boundary="frost"
                  className={cn(
                    "pointer-events-none absolute inset-x-0 top-0 z-[1] backdrop-blur-2xl backdrop-saturate-150",
                    edge
                  )}
                  style={{
                    height: overlap,
                    backgroundColor: tint,
                    maskImage: FROST_RAMP_STRIP,
                    WebkitMaskImage: FROST_RAMP_STRIP,
                  }}
                />
              )}
            </>
          )}

          {variant === "a0" && artwork !== null && !playing && (
            <>
              <div
                aria-hidden
                data-boundary="artwork"
                className={cn(
                  "pointer-events-none absolute inset-x-0 top-0 z-0 overflow-hidden",
                  edge
                )}
                style={{
                  height: artwork.height,
                  maskImage: BLEED_MASK,
                  WebkitMaskImage: BLEED_MASK,
                }}
              >
                <BleedRail
                  innerRef={bleedRailRef}
                  artwork={artwork}
                  backdrops={title.backdrops}
                  title={title.name}
                />
              </div>
              <div
                aria-hidden
                data-boundary="glass"
                className={cn(
                  "pointer-events-none absolute inset-x-0 top-0 z-[1] bg-popover/50 backdrop-blur-2xl backdrop-saturate-150",
                  edge
                )}
                style={{
                  height: artwork.height,
                  maskImage: GLASS_MASK,
                  WebkitMaskImage: GLASS_MASK,
                }}
              />
            </>
          )}

          {variant === "a1" && artwork !== null && !playing && (
            <>
              <div
                aria-hidden
                data-boundary="artwork"
                className={cn(
                  "pointer-events-none absolute inset-x-0 top-0 z-0 overflow-hidden",
                  edge
                )}
                style={{
                  height: artwork.height,
                  maskImage: BLEED_MASK_SOFT,
                  WebkitMaskImage: BLEED_MASK_SOFT,
                }}
              >
                <BleedRail
                  innerRef={bleedRailRef}
                  artwork={artwork}
                  backdrops={title.backdrops}
                  title={title.name}
                />
              </div>
              <div
                aria-hidden
                data-boundary="frost"
                className={cn(
                  "pointer-events-none absolute inset-x-0 top-0 z-[1] backdrop-blur-2xl backdrop-saturate-150",
                  edge
                )}
                style={{
                  height: artwork.height,
                  backgroundColor: tint,
                  maskImage: GLASS_MASK_IN,
                  WebkitMaskImage: GLASS_MASK_IN,
                }}
              />
            </>
          )}

          {variant === "b" && !playing && (
            <div
              aria-hidden
              data-boundary="panel"
              className={cn(
                "pointer-events-none absolute inset-x-0 z-0 backdrop-blur-2xl backdrop-saturate-150",
                edge
              )}
              style={{
                top: -overlap,
                height: panelHeight,
                backgroundColor: tint,
                maskImage: raisedMask,
                WebkitMaskImage: raisedMask,
              }}
            />
          )}

          <div className="relative z-10 mx-auto w-full max-w-2xl min-w-0 px-6 pb-8">
            <div className="flex flex-wrap items-center justify-center gap-1.5 pt-4">
              <Button variant="default" size="sm">
                Watchlist
              </Button>
              <Button variant="secondary" size="sm">
                Watched
              </Button>
              <Button variant="secondary" size="sm">
                Watching
              </Button>
              <Button variant="secondary" size="sm">
                Collections
              </Button>
              {title.trailerKey && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setPlaying((value) => !value)
                    if (!playing) scrollRef.current?.scrollTo({ top: 0 })
                  }}
                >
                  <HugeiconsIcon icon={playing ? Cancel01Icon : PlayIcon} />
                  {playing ? "Stop trailer" : "Play trailer"}
                </Button>
              )}
            </div>
            <h3 className="pt-5 text-2xl font-semibold">{title.name}</h3>
            <p className="pt-1 text-sm text-muted-foreground">
              {title.facts.join(" · ")}
            </p>
            <p className="pt-4 text-sm leading-relaxed">{title.overview}</p>
            <p className="pt-4 text-sm leading-relaxed text-muted-foreground">
              Scroll the panel to check that the boundary travels with the
              content, then change the artwork slide with the arrows or dots —
              the strip below the hero has to follow it.
            </p>
            <div className="mt-6 space-y-3">
              {Array.from({ length: 8 }, (_, index) => (
                <div
                  key={index}
                  className="h-16 w-full rounded-lg bg-muted/60"
                  aria-hidden
                />
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
      {/* Base UI only mounts its overlay scrollbar in a tab that paints, so this
          fixture stands in for it: the same 10px gutter at the right edge.
          z-auto is what the real one has today, which is why the band covers it. */}
      <div
        aria-hidden
        data-fixture-scrollbar
        className={cn(
          "pointer-events-none absolute p-px",
          variant === "a0" ? "z-auto" : "z-30"
        )}
        // Inline geometry: this fixture only exists here, and the utilities it
        // would need are not emitted anywhere else in the app.
        style={{ top: 12, bottom: 12, right: 0, width: 10 }}
      >
        <div
          className="w-full rounded-full"
          style={{
            height: 112,
            backgroundColor:
              "color-mix(in oklab, var(--color-foreground) 25%, transparent)",
          }}
        />
      </div>
    </div>
  )
}

function BleedRail({
  innerRef,
  artwork,
  backdrops,
  title,
}: {
  innerRef: Ref<HTMLDivElement>
  artwork: { width: number; height: number; objectPosition: number }
  backdrops: string[]
  title: string
}) {
  return (
    <div ref={innerRef} className="flex">
      {backdrops.map((path) => (
        <div
          key={path}
          className="relative shrink-0"
          style={{ width: artwork.width, height: artwork.height }}
        >
          <Image
            src={tmdbBackdropUrl(path, "w1280")}
            alt=""
            fill
            sizes={`${Math.round(artwork.width)}px`}
            loading="lazy"
            className="object-cover"
            style={{ objectPosition: `50% ${artwork.objectPosition}%` }}
          />
        </div>
      ))}
      <span className="sr-only">{title} artwork continuation</span>
    </div>
  )
}
