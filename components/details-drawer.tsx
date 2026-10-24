"use client"

import {
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from "react"
import { TitleDetailsOpenContext } from "@/components/title-details"
import { Drawer, DrawerContent } from "@/components/ui/drawer"

function subscribeResize(onChange: () => void) {
  window.addEventListener("resize", onChange)
  return () => window.removeEventListener("resize", onChange)
}

export function DetailsDrawer({
  children,
  open,
  onOpenChange,
  onOpenChangeComplete,
  finalFocus,
}: {
  children: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenChangeComplete?: (open: boolean) => void
  finalFocus?: ComponentProps<typeof DrawerContent>["finalFocus"]
}) {
  const viewportWidth = useSyncExternalStore(
    subscribeResize,
    () => window.innerWidth,
    () => null
  )

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
      showSwipeHandle
    >
      <DrawerContent
        className="h-[calc(100dvh-6rem)] [&>[data-slot=drawer-swipe-handle]]:absolute [&>[data-slot=drawer-swipe-handle]]:top-0 [&>[data-slot=drawer-swipe-handle]]:h-5"
        // Viewport units exclude Base UI's reserved scrollbar gutter on desktop.
        style={
          viewportWidth === null
            ? undefined
            : { width: `calc(${viewportWidth}px - 1rem)` }
        }
        finalFocus={finalFocus}
      >
        <TitleDetailsOpenContext value={open}>
          {children}
        </TitleDetailsOpenContext>
      </DrawerContent>
    </Drawer>
  )
}
