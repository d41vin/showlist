import { Show, SignInButton, SignUpButton } from "@clerk/nextjs"

import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"

export default function Page() {
  return (
    <>
      <Show when="signed-out">
        <main className="flex min-h-[calc(100svh-3.5rem)] items-center justify-center px-6">
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <h1 className="text-4xl font-semibold tracking-tight">ShowList</h1>
            <p className="text-muted-foreground">
              A minimal tracker for movies and TV shows. Keep a watchlist, mark
              what you&apos;ve watched, and organize everything into your own
              collections.
            </p>
            <div className="flex items-center gap-2">
              <SignUpButton>
                <Button>Get started</Button>
              </SignUpButton>
              <SignInButton>
                <Button variant="outline">Sign in</Button>
              </SignInButton>
            </div>
          </div>
        </main>
      </Show>
      <Show when="signed-in">
        <AppShell />
      </Show>
    </>
  )
}
