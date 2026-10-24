"use client"

import type { ComponentProps, ReactNode } from "react"
import { TitleDetailsOpenContext } from "@/components/title-details"
import { Drawer, DrawerContent } from "@/components/ui/drawer"

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
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
      showSwipeHandle
    >
      <DrawerContent
        className="[&>[data-slot=drawer-swipe-handle]]:absolute [&>[data-slot=drawer-swipe-handle]]:top-0 [&>[data-slot=drawer-swipe-handle]]:h-5"
        // Fill the window height minus the 8px inset on both ends.
        style={{
          height: "calc(100dvh - 1rem)",
          maxHeight: "calc(100dvh - 1rem)",
        }}
        finalFocus={finalFocus}
      >
        <TitleDetailsOpenContext value={open}>
          {children}
        </TitleDetailsOpenContext>
      </DrawerContent>
    </Drawer>
  )
}
