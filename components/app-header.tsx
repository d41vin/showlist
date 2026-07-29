"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

export function AppHeader() {
  const pathname = usePathname()
  const discoverActive = pathname === "/discover"

  return (
    <div className="flex items-center gap-4">
      <Link href="/" className="font-semibold tracking-tight">
        ShowList
      </Link>
      <Link
        href="/discover"
        className={cn(
          "text-sm transition-colors hover:text-foreground",
          discoverActive
            ? "font-medium text-foreground"
            : "text-muted-foreground"
        )}
      >
        Discover
      </Link>
    </div>
  )
}
