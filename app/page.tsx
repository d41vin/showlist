// app/page.tsx
import { SearchContainer } from "@/components/search/SearchContainer";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs"; // Example Clerk usage
import ShowCard from "@/components/ShowCard";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center p-4 sm:p-8 md:p-12">
      {/* Example Header with Clerk Auth */}
      <header className="mb-8 flex w-full max-w-4xl items-center justify-between">
        <h1 className="text-2xl font-bold">Movie Tracker</h1>
        <div>
          <SignedOut>
            <SignInButton />
          </SignedOut>
          <SignedIn>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </div>
      </header>

      {/* Search Functionality */}
      <div className="w-full max-w-6xl border-2">
        <SearchContainer />
      </div>

      {/* Other content can go here later */}
      <ShowCard />
    </main>
  );
}
