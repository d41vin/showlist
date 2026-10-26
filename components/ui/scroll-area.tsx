"use client"

import * as React from "react"
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area"

import { cn } from "@/lib/utils"

function ScrollArea({
  className,
  children,
  viewportRef,
  ...props
}: ScrollAreaPrimitive.Root.Props & {
  viewportRef?: React.Ref<HTMLDivElement>
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative overflow-hidden", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        data-slot="scroll-area-viewport"
        className="size-full overscroll-contain rounded-[inherit] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <ScrollAreaPrimitive.Content className="min-w-0!">
          {children}
        </ScrollAreaPrimitive.Content>
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner data-slot="scroll-area-corner" />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      // Layers positioned inside the content raise themselves above this bar,
      // so it needs its own z-index to stay visible and draggable.
      className={cn(
        "flex touch-none p-px select-none",
        orientation === "vertical" &&
          "z-30 h-full w-2.5 border-l border-l-transparent",
        orientation === "horizontal" &&
          "h-2.5 flex-col border-t border-t-transparent",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-foreground/20 transition-colors hover:bg-foreground/35"
      />
    </ScrollAreaPrimitive.Scrollbar>
  )
}

export { ScrollArea, ScrollBar }
