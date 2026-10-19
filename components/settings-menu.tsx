"use client"

import { Show } from "@clerk/nextjs"
import {
  Moon02Icon,
  Settings01Icon,
  Sun01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTheme } from "next-themes"
import { useState } from "react"

import { AiSettingsDialog } from "@/components/ai-settings-dialog"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useAiConfig } from "@/lib/ai"
import { cn } from "@/lib/utils"

// One header entry point for app preferences: the theme switch plus the AI
// settings dialog. The AI key stays browser-local (see lib/ai) — the popover
// row is only a door to that dialog, with the same configured/not hint the
// old header button had.
export function SettingsMenu() {
  const { resolvedTheme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const aiConfigured = useAiConfig() !== null

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label="Settings">
              <HugeiconsIcon icon={Settings01Icon} />
            </Button>
          }
        />
        <PopoverContent align="end" className="w-44 p-1.5">
          <p className="px-2 pt-1.5 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Theme
          </p>
          <div className="flex gap-1 px-1 pb-1">
            <Button
              variant={resolvedTheme === "light" ? "secondary" : "ghost"}
              size="sm"
              className="flex-1"
              onClick={() => setTheme("light")}
            >
              <HugeiconsIcon icon={Sun01Icon} />
              Light
            </Button>
            <Button
              variant={resolvedTheme === "dark" ? "secondary" : "ghost"}
              size="sm"
              className="flex-1"
              onClick={() => setTheme("dark")}
            >
              <HugeiconsIcon icon={Moon02Icon} />
              Dark
            </Button>
          </div>
          <Show when="signed-in">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "w-full justify-start",
                aiConfigured ? "text-foreground" : "text-muted-foreground"
              )}
              onClick={() => {
                setOpen(false)
                setAiOpen(true)
              }}
            >
              AI settings…
            </Button>
          </Show>
        </PopoverContent>
      </Popover>
      <AiSettingsDialog open={aiOpen} onOpenChange={setAiOpen} />
    </>
  )
}
