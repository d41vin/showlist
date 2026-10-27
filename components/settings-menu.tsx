"use client"

import { Show } from "@clerk/nextjs"
import {
  ComputerIcon,
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

// next-themes is mounted with enableSystem, so "system" is a stored
// preference and not merely the absence of one. The rows highlight `theme`
// (what the user picked) instead of `resolvedTheme` (what the OS answered),
// otherwise System could never read as selected.
const THEME_OPTIONS: {
  value: "light" | "dark" | "system"
  label: string
  icon: typeof Sun01Icon
}[] = [
  { value: "light", label: "Light", icon: Sun01Icon },
  { value: "dark", label: "Dark", icon: Moon02Icon },
  { value: "system", label: "System", icon: ComputerIcon },
]

// One header entry point for app preferences: the theme switch plus the AI
// settings dialog. The AI key stays browser-local (see lib/ai) — the popover
// row is only a door to that dialog, with the same configured/not hint the
// old header button had.
export function SettingsMenu() {
  const { theme, setTheme } = useTheme()
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
        <PopoverContent align="end" className="w-44 gap-0.5 p-2">
          <p
            id="theme-group-label"
            className="px-2.5 pt-1 pb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase"
          >
            Theme
          </p>
          <div
            role="group"
            aria-labelledby="theme-group-label"
            className="flex flex-col"
          >
            {THEME_OPTIONS.map((option) => (
              <Button
                key={option.value}
                variant={theme === option.value ? "secondary" : "ghost"}
                size="sm"
                className="w-full justify-start px-2.5"
                aria-pressed={theme === option.value}
                onClick={() => setTheme(option.value)}
              >
                <HugeiconsIcon icon={option.icon} />
                {option.label}
              </Button>
            ))}
          </div>
          <Show when="signed-in">
            <div className="my-1 h-px bg-border/50" aria-hidden />
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "w-full justify-start px-2.5",
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
