"use client"

import { SignInButton } from "@clerk/nextjs"
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useAction, useConvexAuth } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { DetailsDrawer } from "@/components/details-drawer"
import { useNavigationState } from "@/components/navigation-state"
import { TitleDetails } from "@/components/title-details"
import { Button } from "@/components/ui/button"
import { DrawerDescription, DrawerTitle } from "@/components/ui/drawer"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/convex/_generated/api"
import type { MediaType } from "@/lib/media"

type Props = { mediaType: MediaType; tmdbId: number; drawer?: boolean }

export function TitleRoute(props: Props) {
  return (
    <TitleRouteContent key={`${props.mediaType}:${props.tmdbId}`} {...props} />
  )
}

function TitleRouteContent({ mediaType, tmdbId, drawer = false }: Props) {
  const router = useRouter()
  const { titleOrigin } = useNavigationState()
  const { isAuthenticated, isLoading } = useConvexAuth()
  const lookup = useAction(api.tmdb.title)
  const [data, setData] = useState<FunctionReturnType<typeof api.tmdb.title>>()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [open, setOpen] = useState(true)
  const navigated = useRef(false)

  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    lookup({ mediaType, tmdbId })
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, lookup, mediaType, tmdbId, attempt])

  const goBack = () => {
    if (navigated.current) return
    navigated.current = true
    if (titleOrigin) router.back()
    else router.replace("/discover")
  }
  const close = () => {
    setOpen(false)
    // Background browser tabs do not reliably finish CSS exit animations.
    if (document.visibilityState !== "visible") goBack()
  }
  const loading =
    isLoading || (isAuthenticated && data === undefined && !failed)
  const heading = loading
    ? "Loading title…"
    : !isAuthenticated
      ? "Sign in to view this title"
      : failed
        ? "Couldn’t load this title"
        : "Title unavailable"
  const content =
    isAuthenticated && data ? (
      <TitleDetails
        item={data.item}
        data={data.details}
        variant={drawer ? "drawer" : "page"}
        onClose={close}
      />
    ) : (
      <>
        <div className="flex items-center justify-between gap-3 px-6 py-4">
          {drawer ? (
            <div>
              <DrawerTitle>{heading}</DrawerTitle>
              <DrawerDescription className="sr-only">
                Movie or TV show details.
              </DrawerDescription>
            </div>
          ) : (
            <h1 className="text-2xl font-semibold">{heading}</h1>
          )}
          {drawer && (
            <Button variant="outline" size="sm" onClick={close}>
              Close details
            </Button>
          )}
        </div>
        <div className="mx-auto w-full max-w-2xl space-y-4 px-6 py-6">
          {loading ? (
            <div role="status" aria-label="Loading title" className="space-y-4">
              <Skeleton className="h-52 w-full" />
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
      </>
    )

  return (
    <>
      <title>
        {data?.item.title
          ? `${data.item.title} | ShowList`
          : "Title | ShowList"}
      </title>
      {drawer ? (
        <DetailsDrawer
          open={open}
          onOpenChange={(next) => {
            if (!next) close()
          }}
          onOpenChangeComplete={(next) => {
            if (!next) goBack()
          }}
          finalFocus={() =>
            titleOrigin?.element?.isConnected ? titleOrigin.element : false
          }
        >
          {content}
        </DetailsDrawer>
      ) : (
        <main className="pb-8">
          <div className="mx-auto w-full max-w-6xl px-6 pt-4">
            <Button variant="ghost" size="sm" onClick={goBack}>
              <HugeiconsIcon icon={ArrowLeft01Icon} />
              {titleOrigin ? "Back" : "Discover"}
            </Button>
          </div>
          {content}
        </main>
      )}
    </>
  )
}
