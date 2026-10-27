"use client"

import { Button } from "@/components/ui/button"

export type OptionGroupOption<T extends string> = {
  value: T
  label: string
}

interface OptionGroupProps<T extends string> {
  label: string
  value: T
  options: OptionGroupOption<T>[]
  onChange?: (value: T) => void
  /** Locks the current choice without removing it from view. */
  disabled?: boolean
  describedBy?: string
}

/**
 * Single-choice control group used for filters that swap the list beneath them.
 * Stays a labelled group of pressed-state buttons rather than tabs: these
 * options tune a view, they do not own page-sized panels.
 */
export function OptionGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  describedBy,
}: OptionGroupProps<T>) {
  return (
    <div
      className="flex items-center gap-1 rounded-full bg-muted p-1"
      role="group"
      aria-label={label}
      aria-describedby={describedBy}
    >
      {options.map((option) => (
        <Button
          key={option.value}
          variant={option.value === value ? "default" : "ghost"}
          size="sm"
          aria-pressed={option.value === value}
          disabled={disabled}
          onClick={() => onChange?.(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}
