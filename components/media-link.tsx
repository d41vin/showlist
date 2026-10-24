"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useNavigationState } from "@/components/navigation-state"
import { mediaHref, type MediaItem } from "@/lib/media"

export function MediaLink({
  item,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Link>, "href"> & { item: MediaItem }) {
  const pathname = usePathname()
  const { captureTitleOrigin } = useNavigationState()
  const browsing =
    pathname === "/" ||
    pathname === "/discover" ||
    pathname.startsWith("/browse")
  return (
    <Link
      {...props}
      href={mediaHref(item)}
      scroll={!browsing}
      onNavigate={captureTitleOrigin}
    >
      {children}
    </Link>
  )
}
