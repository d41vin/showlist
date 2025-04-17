// components/search/SearchResults.tsx
"use client";

import { TmdbSearchResult } from "@/lib/tmdb";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";
import { ResultCard } from "./ResultCard"; // Import the new component

interface SearchResultsProps {
  results: TmdbSearchResult[];
  isLoading: boolean;
  error: string | null;
  hasSearched: boolean; // Flag to know if a search has been attempted
}

export function SearchResults({
  results,
  isLoading,
  error,
  hasSearched,
}: SearchResultsProps) {
  if (isLoading) {
    // Display Skeleton loaders (adjust to mimic ResultCard structure)
    return (
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {[...Array(10)].map(
          (
            _,
            i, // Show more skeletons for grid view
          ) => (
            <div key={i} className="flex flex-col space-y-2">
              <Skeleton className="bg-muted aspect-[2/3] w-full rounded-md" />{" "}
              {/* Poster Skeleton */}
              <div className="space-y-2 px-1">
                <Skeleton className="bg-muted h-4 w-3/4" />{" "}
                {/* Button Skeleton */}
                <Skeleton className="bg-muted h-4 w-1/2" />{" "}
                {/* Button Skeleton */}
              </div>
            </div>
          ),
        )}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mt-6">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (hasSearched && results.length === 0) {
    return (
      <div className="text-muted-foreground mt-6 text-center">
        No movies or TV shows found matching your search.
      </div>
    );
  }

  if (!hasSearched || results.length === 0) {
    return null; // Don't show anything if no search or empty results before search
  }

  // Render results using a grid layout and the new ResultCard
  return (
    <div className="mt-6 grid grid-cols-[repeat(auto-fit,_minmax(210px,_1fr))] gap-4">
      {/* Use ResultCard  lg:grid-cols-[repeat(auto-fit,_minmax(max-content,_1fr))]*/}
      {results.map((item) => (
        <ResultCard key={`${item.media_type}-${item.id}`} item={item} />
      ))}
    </div>
  );
}
