import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main className="flex min-h-[calc(100svh-3.5rem)] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The page you were looking for doesn&rsquo;t exist.
      </p>
      <Button render={<Link href="/" />}>Back to ShowList</Button>
    </main>
  )
}
