"use client"

import { Show, SignInButton, SignUpButton } from "@clerk/nextjs"
import { Download01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useAction, useConvexAuth, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import {
  buildRuntimeRequest,
  csvField,
  formatWatchTime,
  getActivityYears,
  getLibraryCounts,
  getMonthlyActivity,
  getRuntimeCoverage,
  getTopShows,
  RUNTIME_REQUEST_CAP,
  type EpisodeWatch,
} from "@/lib/stats"
import { cn } from "@/lib/utils"

type ItemDoc = Doc<"items">
type WatchTime = FunctionReturnType<typeof api.stats.get>

const activityConfig = {
  movies: { label: "Movies", color: "var(--chart-1)" },
  episodes: { label: "Episodes", color: "var(--chart-2)" },
} satisfies ChartConfig

const emptyWatchTime: WatchTime = {
  movieMinutes: 0,
  moviesWithRuntime: 0,
  episodeMinutes: 0,
  episodesWithRuntime: 0,
  limited: false,
}

function downloadFile(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function isoOrNull(ms: number | undefined) {
  return ms === undefined ? "" : new Date(ms).toISOString()
}

export default function StatsPage() {
  return (
    <>
      <Show when="signed-out">
        <main className="flex min-h-[calc(100svh-3.5rem)] items-center justify-center px-6">
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <h1 className="text-4xl font-semibold tracking-tight">ShowList</h1>
            <p className="text-muted-foreground">
              Sign in to see your tracking stats.
            </p>
            <div className="flex items-center gap-2">
              <SignUpButton>
                <Button>Get started</Button>
              </SignUpButton>
              <SignInButton>
                <Button variant="outline">Sign in</Button>
              </SignInButton>
            </div>
          </div>
        </main>
      </Show>
      <Show when="signed-in">
        <StatsContent />
      </Show>
    </>
  )
}

function StatsContent() {
  const { isAuthenticated } = useConvexAuth()
  const myItems = useQuery(api.items.listMine, isAuthenticated ? {} : "skip")
  const watches = useQuery(api.episodes.listMine, isAuthenticated ? {} : "skip")
  const myCollections = useQuery(
    api.collections.listMine,
    isAuthenticated ? {} : "skip"
  )
  const memberships = useQuery(
    api.collections.listMemberships,
    isAuthenticated ? {} : "skip"
  )
  const loading = myItems === undefined || watches === undefined
  const exportReady =
    !loading && myCollections !== undefined && memberships !== undefined

  const exportJson = () => {
    if (!exportReady) return
    const payload = {
      exportedAt: new Date().toISOString(),
      items: myItems,
      collections: myCollections.map(({ _id, name }) => ({ id: _id, name })),
      memberships,
      episodeWatches: watches,
    }
    downloadFile(
      `showlist-export-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
      "application/json"
    )
  }

  const exportItemsCsv = () => {
    if (!exportReady) return
    const collectionNames = new Map<Id<"collections">, string>()
    for (const collection of myCollections)
      collectionNames.set(collection._id, collection.name)
    const namesByItem = new Map<Id<"items">, string[]>()
    for (const membership of memberships) {
      const name = collectionNames.get(membership.collectionId)
      if (name === undefined) continue
      const list = namesByItem.get(membership.itemId) ?? []
      list.push(name)
      namesByItem.set(membership.itemId, list)
    }
    const header = [
      "tmdbId",
      "mediaType",
      "title",
      "year",
      "posterPath",
      "inWatchlist",
      "watching",
      "watched",
      "sentiment",
      "collections",
      "watchlistAt",
      "watchedAt",
      "watchingAt",
      "updatedAt",
    ]
    const lines = [header.join(",")]
    for (const item of myItems) {
      lines.push(
        [
          item.tmdbId,
          item.mediaType,
          item.title,
          item.year ?? "",
          item.posterPath ?? "",
          item.inWatchlist,
          item.watching === true,
          item.watched,
          item.sentiment ?? "",
          (namesByItem.get(item._id) ?? []).join("; "),
          isoOrNull(item.watchlistAt),
          isoOrNull(item.watchedAt),
          isoOrNull(item.watchingAt),
          isoOrNull(item.updatedAt),
        ]
          .map(csvField)
          .join(",")
      )
    }
    downloadFile(
      `showlist-items-${new Date().toISOString().slice(0, 10)}.csv`,
      `\uFEFF${lines.join("\r\n")}`,
      "text/csv;charset=utf-8"
    )
  }

  const counts = useMemo(
    () => getLibraryCounts(myItems ?? [], watches ?? []),
    [myItems, watches]
  )
  const rated = counts.liked + counts.disliked

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Stats</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your library, your habits, your time.
        </p>
      </div>

      {loading ? (
        <div
          className="grid gap-6"
          role="status"
          aria-label="Loading your stats"
        >
          <Card>
            <CardContent>
              <StatSectionSkeleton count={4} />
            </CardContent>
          </Card>
          <Skeleton className="h-80 w-full" />
          <Card>
            <CardContent>
              <StatSectionSkeleton count={3} />
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid gap-6">
          {counts.titles === 0 && watches.length === 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Your story starts here</CardTitle>
                <CardDescription>
                  Add a title or log an episode and your stats will take shape.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button nativeButton={false} render={<Link href="/discover" />}>
                  Discover something to watch
                </Button>
              </CardContent>
            </Card>
          )}

          <Card role="region" aria-labelledby="library-heading">
            <CardHeader>
              <CardTitle>
                <h2 id="library-heading">Library at a glance</h2>
              </CardTitle>
              <CardDescription>
                All-time totals from your current library.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <Stat number={counts.titles} label="Titles tracked" big />
              <Stat number={counts.movies} label="Movies" big />
              <Stat number={counts.shows} label="Shows" big />
              <Stat number={counts.episodes} label="Episodes logged" big />
            </CardContent>
          </Card>

          <WatchTimeSection items={myItems} watches={watches} />

          <div className="grid min-w-0 gap-6 lg:grid-cols-[2fr_1fr]">
            <ActivitySection items={myItems} watches={watches} />
            <TopShowsSection items={myItems} watches={watches} />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card role="region" aria-labelledby="status-heading">
              <CardHeader>
                <CardTitle>
                  <h2 id="status-heading">Where things stand</h2>
                </CardTitle>
                <CardDescription>
                  Statuses are independent, so a title can appear in more than
                  one.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-3">
                <Stat number={counts.watchlist} label="Watchlist" />
                <Stat number={counts.watching} label="Watching" />
                <Stat number={counts.watched} label="Watched" />
              </CardContent>
            </Card>
            <Card role="region" aria-labelledby="sentiment-heading">
              <CardHeader>
                <CardTitle>
                  <h2 id="sentiment-heading">Your verdict</h2>
                </CardTitle>
                <CardDescription>
                  {rated > 0
                    ? `You liked ${Math.round((counts.liked / rated) * 100)}% of the titles you reacted to.`
                    : "Like or dislike a title to start building your taste profile."}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-3">
                <Stat number={counts.liked} label="Liked" />
                <Stat number={counts.disliked} label="Disliked" />
                <Stat number={counts.titles - rated} label="No reaction" />
              </CardContent>
            </Card>
          </div>

          <Card role="region" aria-labelledby="export-heading">
            <CardHeader>
              <CardTitle>
                <h2 id="export-heading">Take your library with you</h2>
              </CardTitle>
              <CardDescription>
                Exports always include your full library, regardless of the
                selected activity year.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={exportJson}
                  disabled={!exportReady}
                >
                  <HugeiconsIcon icon={Download01Icon} />
                  Download JSON
                </Button>
                <Button
                  variant="outline"
                  onClick={exportItemsCsv}
                  disabled={!exportReady}
                >
                  <HugeiconsIcon icon={Download01Icon} />
                  Download items CSV
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                JSON includes items, collections and episode logs; CSV includes
                items and collection names. Generated in your browser.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  )
}

function WatchTimeSection({
  items,
  watches,
}: {
  items: ItemDoc[]
  watches: EpisodeWatch[]
}) {
  const statsGet = useAction(api.stats.get)
  const request = useMemo(
    () => buildRuntimeRequest(items, watches),
    [items, watches]
  )
  const requestKey = JSON.stringify(request)
  const movieCount = request.movieIds.length
  const episodeCount = request.tvSeasons.reduce(
    (total, season) => total + season.episodes.length,
    0
  )
  const empty = movieCount === 0 && episodeCount === 0
  const [retry, setRetry] = useState({ key: "", attempt: 0 })
  const attempt = retry.key === requestKey ? retry.attempt : 0
  const retryRuntimes = () =>
    setRetry({ key: requestKey, attempt: attempt + 1 })
  const [response, setResponse] = useState<{
    key: string
    attempt: number
    data: WatchTime | null
    failed: boolean
  } | null>(null)

  useEffect(() => {
    if (empty) return
    let cancelled = false
    const input: ReturnType<typeof buildRuntimeRequest> = JSON.parse(requestKey)
    statsGet({ ...input, refreshMissing: attempt > 0 })
      .then((data) => {
        if (!cancelled)
          setResponse({ key: requestKey, attempt, data, failed: false })
      })
      .catch(() => {
        if (!cancelled)
          setResponse({ key: requestKey, attempt, data: null, failed: true })
      })
    return () => {
      cancelled = true
    }
  }, [requestKey, empty, attempt, statsGet])

  const current =
    response?.key === requestKey && response.attempt === attempt
      ? response
      : null
  const data = empty ? emptyWatchTime : current?.data
  const failed = !empty && current?.failed
  const { missing, retryableMissing } = getRuntimeCoverage(
    request,
    data ?? emptyWatchTime
  )
  const totalMinutes = data ? data.movieMinutes + data.episodeMinutes : 0

  return (
    <Card role="region" aria-labelledby="runtime-heading">
      <CardHeader>
        <CardTitle>
          <h2 id="runtime-heading">Time well spent</h2>
        </CardTitle>
        <CardDescription>
          All-time estimate from watched movies and only the episodes you
          logged.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {failed ? (
          <div className="flex flex-wrap items-center gap-3" role="status">
            <p className="text-sm text-muted-foreground">
              Couldn&rsquo;t load runtime data. Your library stats are still
              available.
            </p>
            <Button variant="outline" size="sm" onClick={retryRuntimes}>
              Try again
            </Button>
          </div>
        ) : !data ? (
          <div role="status" aria-label="Loading watch time">
            <StatSectionSkeleton count={3} />
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <Stat
                number={
                  missing > 0 && totalMinutes === 0
                    ? "Unavailable"
                    : formatWatchTime(totalMinutes)
                }
                label={missing > 0 ? "Known watch time" : "Total watch time"}
                big
              />
              <Stat
                number={
                  movieCount > 0 && data.moviesWithRuntime === 0
                    ? "—"
                    : formatWatchTime(data.movieMinutes)
                }
                label="Movies"
                hint={`${data.moviesWithRuntime} of ${movieCount} with runtime`}
              />
              <Stat
                number={
                  episodeCount > 0 && data.episodesWithRuntime === 0
                    ? "—"
                    : formatWatchTime(data.episodeMinutes)
                }
                label="Episodes"
                hint={`${data.episodesWithRuntime} of ${episodeCount} with runtime`}
              />
            </div>
            {empty ? (
              <p className="text-xs text-muted-foreground">
                Mark a movie watched or log an episode to start your estimate.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                TMDB runtimes, not a playback timer. Rewatches are not counted
                separately.
              </p>
            )}
            {missing > 0 && (
              <div className="flex flex-wrap items-center gap-3" role="status">
                <p className="text-xs text-muted-foreground">
                  {retryableMissing > 0
                    ? "Some runtimes are unavailable, so this total is incomplete."
                    : "All runtimes within the estimate limit are included."}
                  {data.limited
                    ? ` Estimates cover up to ${RUNTIME_REQUEST_CAP} movies and ${RUNTIME_REQUEST_CAP} seasons; retrying cannot extend that limit.`
                    : ""}
                </p>
                {retryableMissing > 0 && (
                  <Button variant="outline" size="sm" onClick={retryRuntimes}>
                    Retry runtimes
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ActivitySection({
  items,
  watches,
}: {
  items: ItemDoc[]
  watches: EpisodeWatch[]
}) {
  const [currentYear] = useState(() => new Date().getFullYear())
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const years = useMemo(
    () => getActivityYears(items, watches, currentYear),
    [items, watches, currentYear]
  )
  const year = years.includes(selectedYear) ? selectedYear : currentYear
  const activity = useMemo(
    () => getMonthlyActivity(items, watches, year),
    [items, watches, year]
  )
  const hasActivity = activity.movies + activity.episodes > 0

  return (
    <Card className="min-w-0" role="region" aria-labelledby="activity-heading">
      <CardHeader>
        <CardTitle>
          <h2 id="activity-heading">Your year in logs</h2>
        </CardTitle>
        <CardDescription>
          Movies marked watched and episodes logged.
        </CardDescription>
        <CardAction>
          <Select
            value={year}
            onValueChange={(value) => {
              if (value !== null) setSelectedYear(value)
            }}
          >
            <SelectTrigger aria-label="Activity year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-5">
        <div className="grid grid-cols-3 gap-3" aria-live="polite">
          <Stat number={activity.movies} label="Movies" />
          <Stat number={activity.episodes} label="Episodes" />
          <Stat number={activity.activeDays} label="Days logged" />
        </div>
        {hasActivity ? (
          <>
            <ChartContainer
              config={activityConfig}
              className="aspect-auto h-56 w-full"
              aria-label={`Monthly logging activity for ${year}`}
            >
              <BarChart
                accessibilityLayer
                data={activity.months}
                margin={{ left: -20, right: 4 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={8}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={40}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar
                  dataKey="movies"
                  fill="var(--color-movies)"
                  radius={4}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="episodes"
                  fill="var(--color-episodes)"
                  radius={4}
                  isAnimationActive={false}
                />
              </BarChart>
            </ChartContainer>
            <details className="text-sm">
              <summary className="cursor-pointer">View monthly numbers</summary>
              <table className="mt-3 w-full text-left tabular-nums">
                <caption className="sr-only">
                  Monthly logging totals for {year}
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="py-2">
                      Month
                    </th>
                    <th scope="col" className="py-2 text-right">
                      Movies
                    </th>
                    <th scope="col" className="py-2 text-right">
                      Episodes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activity.months.map((month) => (
                    <tr key={month.month}>
                      <th scope="row" className="py-1 text-left font-normal">
                        {month.month}
                      </th>
                      <td className="py-1 text-right">{month.movies}</td>
                      <td className="py-1 text-right">{month.episodes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No dated activity in {year} yet.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Dates reflect when you marked things, not necessarily when you watched
          them. Clearing a log removes it here; re-marking moves its date.
          {activity.undatedMovies > 0
            ? ` ${activity.undatedMovies} watched ${activity.undatedMovies === 1 ? "movie has" : "movies have"} no saved date and ${activity.undatedMovies === 1 ? "is" : "are"} excluded from the chart.`
            : ""}
        </p>
      </CardContent>
    </Card>
  )
}

function TopShowsSection({
  items,
  watches,
}: {
  items: ItemDoc[]
  watches: EpisodeWatch[]
}) {
  const shows = useMemo(() => getTopShows(items, watches), [items, watches])
  return (
    <Card role="region" aria-labelledby="shows-heading">
      <CardHeader>
        <CardTitle>
          <h2 id="shows-heading">Your most-logged shows</h2>
        </CardTitle>
        <CardDescription>
          Top five by episodes logged, across all time.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {shows.length === 0 ? (
          <p className="py-8 text-sm text-muted-foreground">
            Log episodes from a show&rsquo;s details to see your favourites rise
            to the top.
          </p>
        ) : (
          <ol className="grid gap-5">
            {shows.map((show, index) => (
              <li key={show.tmdbId} className="flex min-w-0 items-start gap-3">
                <span
                  className="text-sm text-muted-foreground tabular-nums"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium wrap-break-word">
                    {show.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {show.episodes.toLocaleString()}{" "}
                    {show.episodes === 1 ? "episode" : "episodes"}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

function Stat({
  number,
  label,
  hint,
  big = false,
}: {
  number: number | string
  label: string
  hint?: string
  big?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p
        className={cn(
          "font-semibold tracking-tight tabular-nums",
          big ? "text-3xl" : "text-2xl"
        )}
      >
        {typeof number === "number" ? number.toLocaleString() : number}
      </p>
      <p className="text-sm text-muted-foreground">{label}</p>
      {hint !== undefined && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

function StatSectionSkeleton({ count }: { count: number }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-6",
        count === 3 ? "sm:grid-cols-3" : "sm:grid-cols-4"
      )}
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col gap-1">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  )
}
