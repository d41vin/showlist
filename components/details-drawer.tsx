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
    >
      <DrawerContent
        className="[--drawer-inset:--spacing(5)]"
        // The layout viewport stops at the window scrollbar gutter, so pull
        // the right margin in by that gutter to reach a true 20px gap at the
        // physical edge without putting content under the scrollbar.
        style={{
          marginRight:
            "calc(var(--drawer-inset) - var(--drawer-window-gutter, 0px))",
          height: "calc(100dvh - var(--drawer-inset) - var(--drawer-inset))",
          maxHeight: "calc(100dvh - var(--drawer-inset) - var(--drawer-inset))",
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
