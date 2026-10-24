import { Show, SignInButton } from "@clerk/nextjs"
import type { Metadata } from "next"
import { Suspense } from "react"
import { SearchPageContent } from "@/components/search-page"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "Search" }

export default function SearchPage() {
  return (
    <>
      <Show when="signed-out">
        <main className="mx-auto flex max-w-xl flex-col items-center gap-4 px-6 py-16 text-center">
          <h1 className="text-2xl font-semibold">Find your next watch</h1>
          <p className="text-muted-foreground">
            Sign in to search movies, TV shows, and your library.
          </p>
          <SignInButton>
            <Button>Sign in</Button>
          </SignInButton>
        </main>
      </Show>
      <Show when="signed-in">
        <Suspense
          fallback={
            <main className="p-8 text-center text-muted-foreground">
              Loading search…
            </main>
          }
        >
          <SearchPageContent />
        </Suspense>
      </Show>
    </>
  )
}
