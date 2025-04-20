// app/page.tsx
import { SearchContainer } from "@/components/search/SearchContainer";
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs"; // Example Clerk usage
import ShowCard from "@/components/ShowCard";

export default function HomePage() {
  return (
    <main className="from-0.1% flex min-h-screen flex-col items-center p-4 sm:p-8 md:p-12">
      {/* Example Header with Clerk Auth */}
      <header className="flex h-16 w-full max-w-6xl items-center justify-end gap-4 p-4">
        <SignedOut>
          <SignInButton />
          <SignUpButton />
        </SignedOut>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </header>

      {/* Search Functionality */}
      <div className="w-full max-w-6xl border-2">
        <h1 className="text-primary mt-8 mb-2 text-center text-4xl font-bold tracking-tight">
          Showlist
        </h1>

        <h2 className="text-muted-foreground mb-8 text-center text-lg">
          Utility driven movie and tv show tracking and recommendation app
        </h2>
        <SearchContainer />
      </div>

      {/* Other content can go here later */}
      <ShowCard
        title="Example Movie"
        year={2023}
        type="Movie"
        posterUrl="/placeholder.jpg"
        onWatchlist={() => console.log("Added to watchlist")}
        onWatched={() => console.log("Marked as watched")}
        onAddToList={(listName) => console.log(`Added to ${listName}`)}
      />
    </main>
  );
}
