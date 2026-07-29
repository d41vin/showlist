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
  { value: "tv", label: "TV" },
]

export function MediaTypeToggle({ value, onChange }: MediaTypeToggleProps) {
  return (
    <div className="flex gap-1.5">
      {options.map((option) => (
        <Button
          key={option.value}
          variant={value === option.value ? "default" : "secondary"}
          size="sm"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}
