// components/search/SearchContainer.tsx
"use client";

import { useState, useTransition } from "react";
import { SearchInput } from "./SearchInput";
import { SearchResults } from "./SearchResults";
import { searchAction } from "@/actions/search";
import {
  TmdbSearchResult,
  MovieSearchResult,
  TvSearchResult,
} from "@/lib/tmdb"; // Import specific types if needed

// Helper function to get the year from a result item
const getYearFromResult = (item: TmdbSearchResult): number => {
  const dateString =
    item.media_type === "movie"
      ? (item as MovieSearchResult).release_date
      : (item as TvSearchResult).first_air_date;
  if (dateString) {
    const year = parseInt(dateString.substring(0, 4), 10);
    return isNaN(year) ? 0 : year; // Return 0 for invalid dates to sort them last/first depending on order
  }
  return 0; // Treat items without a date as oldest
};

export function SearchContainer() {
  const [results, setResults] = useState<TmdbSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  // useTransition hook manages pending states for Server Actions
  // isPending: boolean indicating if the action is currently running
  // startTransition: function to wrap the action call
  const [isPending, startTransition] = useTransition();

  // This function will be passed to SearchInput and called on form submission
  const handleSearch = (query: string) => {
    // Reset states before starting new search
    setResults([]);
    setError(null);
    setHasSearched(true); // Mark that a search attempt has been made

    // Create FormData to pass to the server action
    const formData = new FormData();
    formData.append("query", query);

    // Wrap the server action call in startTransition
    startTransition(async () => {
      try {
        const actionResult = await searchAction(formData);

        if (actionResult.status === "success") {
          // --- SORTING LOGIC ---
          const sortedData = actionResult.data.sort((a, b) => {
            const yearA = getYearFromResult(a);
            const yearB = getYearFromResult(b);
            // Sort descending (newest first)
            // Handle cases where year might be 0 (missing/invalid)
            if (yearB === 0 && yearA !== 0) return -1; // Put items with year before items without year
            if (yearA === 0 && yearB !== 0) return 1; // Put items with year before items without year
            return yearB - yearA; // Descending sort
          });
          // --- END SORTING LOGIC ---

          setResults(sortedData); // Set the *sorted* results
          setError(null); // Clear any previous error
        } else {
          // Action returned an error state
          setError(actionResult.error);
          setResults([]); // Clear results on error
        }
      } catch (e) {
        // Catch unexpected errors during the action call itself
        // (Should ideally be caught within the action, but good practice)
        console.error("Error calling search action:", e);
        setError("An unexpected error occurred. Please try again.");
        setResults([]);
      }
    });
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex flex-col items-center">
        <SearchInput onSearch={handleSearch} isLoading={isPending} />
      </div>
      <SearchResults
        results={results}
        isLoading={isPending}
        error={error}
        hasSearched={hasSearched}
      />
    </div>
  );
}
