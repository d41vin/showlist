"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { DetailsDrawer } from "@/components/details-drawer"
import { DrawerNavigationContext } from "@/components/media-link"
import { useNavigationState } from "@/components/navigation-state"
import { TitleRoute } from "@/components/title-route"
import { parseTitlePath } from "@/lib/navigation"

export function BrowseDrawer() {
  const pathname = usePathname()
  const router = useRouter()
  const {
    pendingTitle,
    clearPendingTitle,
    titleOrigin,
    drawerOrigin,
    returnToOrigin,
  } = useNavigationState()
  const route = parseTitlePath(pathname)
  const target = pendingTitle
    ? { ...pendingTitle.item, recommendations: false }
    : route
  const key = target
    ? `${target.mediaType}:${target.tmdbId}:${target.recommendations}`
    : null
  const [state, setState] = useState({ key, open: key !== null })
  const navigated = useRef(false)
  if (key !== state.key) setState({ key, open: key !== null })
  useEffect(() => {
    navigated.current = false
  }, [key])
  const origin = pendingTitle?.origin ?? drawerOrigin?.origin ?? titleOrigin
  const goBack = () => {
    if (navigated.current) return
    navigated.current = true
    if (pendingTitle && route === null) {
      router.replace(pendingTitle.origin.href, { scroll: false })
      clearPendingTitle()
    } else if (origin) {
      returnToOrigin(origin, drawerOrigin?.depth ?? 1)
    } else {
      router.replace("/discover")
    }
  }
  const close = () => {
    setState({ key, open: false })
    if (
      document.visibilityState !== "visible" ||
      (pendingTitle && route === null)
    )
      goBack()
  }

  if (!target) return null
  return (
    <DetailsDrawer
      open={state.key !== key || state.open}
      onOpenChange={(open) => {
        if (!open) close()
      }}
      onOpenChangeComplete={(open) => {
        if (!open) goBack()
      }}
      finalFocus={() => (origin?.element?.isConnected ? origin.element : false)}
    >
      <DrawerNavigationContext value>
        <TitleRoute
          key={`${target.mediaType}:${target.tmdbId}`}
          mediaType={target.mediaType}
          tmdbId={target.tmdbId}
          drawer
          recommendations={target.recommendations}
          initialItem={pendingTitle?.item}
          onClose={close}
        />
      </DrawerNavigationContext>
    </DetailsDrawer>
  )
}
