"use client"

import { OptionGroup, type OptionGroupOption } from "@/components/option-group"

export type MediaTypeFilter = "all" | "movie" | "tv"

const options: OptionGroupOption<MediaTypeFilter>[] = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "tv", label: "Series" },
]

interface MediaTypeToggleProps {
  value: MediaTypeFilter
  onChange: (value: MediaTypeFilter) => void
}

export function MediaTypeToggle({ value, onChange }: MediaTypeToggleProps) {
  return (
    <OptionGroup
      label="Media type"
      value={value}
      options={options}
      onChange={onChange}
    />
  )
}
