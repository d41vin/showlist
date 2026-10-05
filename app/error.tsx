"use client"

import { useEffect } from "react"

import { Button } from "@/components/ui/button"

// Route-segment error boundary. This Next version exposes the retry as
// `unstable_retry` (not the older `reset`).
export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="flex min-h-[calc(100svh-3.5rem)] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Something went wrong
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        An unexpected error occurred. Try again — if it keeps happening,
        reload the page.
      </p>
      <Button onClick={() => unstable_retry()}>Try again</Button>
    </main>
  )
}
