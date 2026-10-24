"use client"

import Link from "next/link"
import { createContext, useContext } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useConvexAuth } from "convex/react"
import { useNavigationState } from "@/components/navigation-state"
import { mediaHref, type MediaItem } from "@/lib/media"

export const DrawerNavigationContext = createContext(false)

export function MediaLink({
  item,
  children,
  onNavigate,
  onMouseEnter,
  onFocus,
  replace,
  ...props
}: Omit<React.ComponentProps<typeof Link>, "href"> & { item: MediaItem }) {
  const pathname = usePathname()
  const router = useRouter()
  const { isAuthenticated } = useConvexAuth()
  const { captureTitleOrigin, prepareTitle, loadTitle } = useNavigationState()
  const browsing =
    pathname === "/" ||
    pathname === "/discover" ||
    pathname.startsWith("/browse")
  const inDrawer = useContext(DrawerNavigationContext)
  const prefetch = () => {
    router.prefetch(mediaHref(item))
    if (isAuthenticated) void loadTitle(item).catch(() => {})
  }
  return (
    <Link
      scroll={!browsing && !inDrawer}
      {...props}
      replace={replace && !browsing}
      href={mediaHref(item)}
      onMouseEnter={(event) => {
        onMouseEnter?.(event)
        prefetch()
      }}
      onFocus={(event) => {
        onFocus?.(event)
        prefetch()
      }}
      onNavigate={(event) => {
        if (onNavigate) onNavigate(event)
        else captureTitleOrigin()
        prepareTitle(item, browsing)
      }}
    >
      {children}
    </Link>
  )
}
