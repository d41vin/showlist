"use client"

import { SignInButton } from "@clerk/nextjs"
import { useConvexAuth } from "convex/react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { useNavigationState } from "@/components/navigation-state"
import { RecommendationsView } from "@/components/recommendations-view"
import { TitleDetails } from "@/components/title-details"
import { Button } from "@/components/ui/button"
import { DrawerDescription, DrawerTitle } from "@/components/ui/drawer"
import { Skeleton } from "@/components/ui/skeleton"
import type { MediaItem, MediaType } from "@/lib/media"

type Props = {
  mediaType: MediaType
  tmdbId: number
  drawer?: boolean
  recommendations?: boolean
  initialItem?: MediaItem
  onClose?: () => void
}

export function TitleRoute(props: Props) {
  return (
    <TitleRouteContent key={`${props.mediaType}:${props.tmdbId}`} {...props} />
  )
}

function TitleRouteContent({
  mediaType,
  tmdbId,
  drawer = false,
  recommendations = false,
  initialItem,
  onClose,
}: Props) {
  const router = useRouter()
  const {
    titleOrigin,
    drawerOrigin,
    loadTitle,
    cachedTitle,
    returnToOrigin,
    keepTitleOrigin,
  } = useNavigationState()
  const { isAuthenticated, isLoading } = useConvexAuth()
  const drilled = drawer && (drawerOrigin?.depth ?? 1) > 1
  const [snapshot] = useState(initialItem)
  const [data, setData] = useState(() => cachedTitle({ mediaType, tmdbId }))
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    loadTitle({ mediaType, tmdbId }, attempt > 0)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, loadTitle, mediaType, tmdbId, attempt])

  const goBack = () => {
    const titleHref = `/${mediaType}/${tmdbId}`
    if (titleOrigin && (!recommendations || titleOrigin.href === titleHref))
      returnToOrigin(titleOrigin)
    else {
      if (drawer && recommendations && titleOrigin) keepTitleOrigin()
      router.replace(recommendations ? titleHref : "/discover")
    }
  }
  const loading =
    isLoading || (isAuthenticated && data === undefined && !failed)
  const heading = loading
    ? (snapshot?.title ?? "Loading title…")
    : !isAuthenticated
      ? "Sign in to view this title"
      : failed
        ? "Couldn’t load this title"
        : "Title unavailable"
  const content =
    isAuthenticated && data ? (
      recommendations ? (
        <RecommendationsView
          item={data.item}
          variant={drawer ? "drawer" : "page"}
          onBack={goBack}
          onClose={onClose}
        />
      ) : (
        <TitleDetails
          item={data.item}
          data={data.details}
          variant={drawer ? "drawer" : "page"}
          onClose={onClose}
          onBack={drawer ? (drilled ? () => router.back() : undefined) : goBack}
        />
      )
    ) : (
      <div className="w-full min-w-0">
        {loading && (
          <Skeleton className="h-[clamp(15rem,38vw,28.125rem)] max-h-[55dvh] w-full rounded-none" />
        )}
        <div className="mx-auto w-full max-w-2xl space-y-4 px-6 py-6">
          <div className="flex flex-wrap justify-center gap-2">
            {drawer && drilled && (
              <Button
                variant="secondary"
                size="sm"
                aria-label="Back to previous title"
                onClick={() => router.back()}
              >
                Back
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={drawer ? onClose : goBack}
              aria-label={drawer ? "Close details" : "Back"}
            >
              {drawer ? "Close" : "Back"}
            </Button>
          </div>
          {drawer ? (
            <>
              <DrawerTitle>{heading}</DrawerTitle>
              <DrawerDescription className="sr-only">
                Movie or series details.
              </DrawerDescription>
            </>
          ) : (
            <h1 className="text-2xl font-semibold">{heading}</h1>
          )}
          {loading ? (
            <div role="status" aria-label="Loading title" className="space-y-4">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : !isAuthenticated ? (
            <SignInButton>
              <Button>Sign in</Button>
            </SignInButton>
          ) : failed ? (
            <div role="alert" className="space-y-4">
              <p className="text-muted-foreground">
                Check your connection and try again.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setFailed(false)
                  setData(undefined)
                  setAttempt((value) => value + 1)
                }}
              >
                Retry title
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground">
              This title could not be found or is no longer available.
            </p>
          )}
        </div>
      </div>
    )

  return (
    <>
      <title>
        {data?.item.title
          ? `${recommendations ? "More like " : ""}${data.item.title} | ShowList`
          : "Title | ShowList"}
      </title>
      {drawer ? content : <main className="pb-8">{content}</main>}
    </>
  )
}
