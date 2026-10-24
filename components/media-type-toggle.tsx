"use client"

import { Button } from "@/components/ui/button"

export type MediaTypeFilter = "all" | "movie" | "tv"

interface MediaTypeToggleProps {
  value: MediaTypeFilter
  onChange: (value: MediaTypeFilter) => void
}

const options: { value: MediaTypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "tv", label: "Series" },
]

export function MediaTypeToggle({ value, onChange }: MediaTypeToggleProps) {
  return (
    <div
      className="flex items-center gap-1 rounded-full bg-muted p-1"
      role="group"
      aria-label="Media type"
    >
      {options.map((option) => (
        <Button
          key={option.value}
          variant={value === option.value ? "default" : "ghost"}
          size="sm"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}
