"use client"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
 * Rendered with the Tabs primitive, so every filter strip in the app reads and
 * behaves the same; the panels themselves stay outside the component because
 * each page keeps its own loading and URL wiring.
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
    <Tabs value={value} onValueChange={(next) => onChange?.(next as T)}>
      <TabsList aria-label={label} aria-describedby={describedBy}>
        {options.map((option) => (
          <TabsTrigger
            key={option.value}
            value={option.value}
            disabled={disabled}
          >
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
