// actions/search.ts
"use server"; // Defines this entire file as containing Server Actions

import { searchTmdb, TmdbSearchResult } from "@/lib/tmdb";
import { z } from "zod";

// Define a schema for the expected input (query string)
const SearchQuerySchema = z.string().min(1, "Search query cannot be empty.");

// Define a discriminated union for the return type to handle success and error states
type SearchActionState =
  | { status: "success"; data: TmdbSearchResult[] }
  | { status: "error"; error: string };

export async function searchAction(
  // prevState: SearchActionState | null, // Used with useFormState, we'll use useTransition for now
  formData: FormData, // Standard argument for actions used with forms
): Promise<SearchActionState> {
  const queryData = formData.get("query"); // Get the 'query' field from FormData

  // Validate the query using Zod
  const validationResult = SearchQuerySchema.safeParse(queryData);

  if (!validationResult.success) {
    // Join errors if multiple (though min(1) makes it unlikely here)
    const errorMessage = validationResult.error.errors
      .map((e) => e.message)
      .join(", ");
    return { status: "error", error: `Invalid input: ${errorMessage}` };
  }

  const query = validationResult.data;

  try {
    console.log(`[Server Action] Searching TMDB for: "${query}"`); // Server-side log
    const results = await searchTmdb(query);
    console.log(`[Server Action] Found ${results.length} results.`); // Server-side log
    return { status: "success", data: results };
  } catch (error) {
    console.error("[Server Action] TMDB Search Error:", error);
    // Return a generic error message to the client for security
    // Log the specific error on the server for debugging
    return {
      status: "error",
      error: "Failed to search TMDB. Please try again later.",
    };
  }
}

// --- Alternative Action Structure (if not using FormData directly) ---
// If you wanted to call this action programmatically with a string argument
// instead of directly from a form's action prop, you could define it like this:
/*
export async function searchActionWithString(query: string): Promise<SearchActionState> {
    const validationResult = SearchQuerySchema.safeParse(query);
    // ... rest of the validation and try/catch logic ...
}
*/
// We'll stick with the FormData approach for now as it integrates nicely with the <form> element.
