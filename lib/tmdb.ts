// lib/tmdb.ts
import { z } from "zod";

// --- Type Definitions (Zod schemas) ---

const movieResultSchema = z.object({
  id: z.number(),
  title: z.string(),
  poster_path: z.string().nullable(),
  release_date: z.string().optional().default(""), // Provide default for easier handling
  overview: z.string(),
  media_type: z.literal("movie"),
  // Add other fields you might want later, e.g., vote_average: z.number().optional()
});

const tvResultSchema = z.object({
  id: z.number(),
  name: z.string(), // Note: TV uses 'name', movies use 'title'
  poster_path: z.string().nullable(),
  first_air_date: z.string().optional().default(""), // Provide default
  overview: z.string(),
  media_type: z.literal("tv"),
  // Add other fields you might want later, e.g., vote_average: z.number().optional()
});

// --- ADD Person Schema ---
const personResultSchema = z.object({
  id: z.number(),
  name: z.string(),
  profile_path: z.string().nullable(), // People have profile_path
  known_for_department: z.string().optional(), // Common field for people
  media_type: z.literal("person"),
});
// --- END ADD Person Schema ---

// Combined Search Result Item Schema (Discriminated Union)
const searchResultItemSchema = z.discriminatedUnion("media_type", [
  movieResultSchema,
  tvResultSchema,
  personResultSchema, // Include person schema here
]);

// API Response Schema for /search/multi
const multiSearchResponseSchema = z.object({
  page: z.number(),
  // Use the updated searchResultItemSchema, but allow unknown to handle unexpected types gracefully
  // We will filter *after* parsing.
  results: z.array(z.unknown()), // Parse as unknown first, then filter/validate individuals
  total_pages: z.number(),
  total_results: z.number(),
});

// Define the type based on the Zod schema
export type MovieSearchResult = z.infer<typeof movieResultSchema>;
export type TvSearchResult = z.infer<typeof tvResultSchema>;
// Keep the union type for easier handling after filtering
export type TmdbSearchResult = MovieSearchResult | TvSearchResult;

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

export async function searchTmdb(query: string): Promise<TmdbSearchResult[]> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    console.error("TMDB_API_KEY environment variable is not set.");
    throw new Error("Server configuration error: TMDB API key is missing.");
  }

  if (!query) {
    return []; // Return empty array if query is empty
  }

  const url = new URL(`${TMDB_BASE_URL}/search/multi`);
  url.searchParams.append("api_key", apiKey);
  url.searchParams.append("query", query);
  url.searchParams.append("include_adult", "false"); // Optional: filter adult content
  url.searchParams.append("language", "en-US"); // Optional: set language
  url.searchParams.append("page", "1"); // Optional: handle pagination later if needed

  try {
    const response = await fetch(url.toString(), {
      // Add cache policy for fetch requests in Server Components/Actions
      // 'no-store' is good for dynamic data like search results
      // Consider 'force-cache' or revalidation if data doesn't change often
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(
        `TMDB API Error: ${response.status} ${response.statusText}`,
      );
      const errorBody = await response.text();
      console.error("Error Body:", errorBody);
      throw new Error(`Failed to fetch data from TMDB: ${response.statusText}`);
    }

    const data: unknown = await response.json(); // Fetch as unknown first

    // First, validate the overall structure (page, results array, etc.)
    const structureValidation = multiSearchResponseSchema.safeParse(data);

    if (!structureValidation.success) {
      console.error(
        "TMDB API Response Structure Validation Error:",
        structureValidation.error.errors,
      );
      throw new Error("Invalid overall data structure received from TMDB API.");
    }

    // --- Refined Filtering and Validation ---
    // Now, iterate through the results and validate/filter only movie/tv types
    const validatedAndFilteredResults: TmdbSearchResult[] = [];
    for (const item of structureValidation.data.results) {
      const itemValidation = searchResultItemSchema.safeParse(item); // Validate individual item
      if (itemValidation.success) {
        // If valid AND it's a movie or TV show, add it
        if (
          itemValidation.data.media_type === "movie" ||
          itemValidation.data.media_type === "tv"
        ) {
          validatedAndFilteredResults.push(itemValidation.data);
        }
        // Ignore valid 'person' results or any other valid types we don't handle
      } else {
        // Log if an item *within* the results array fails validation, but continue
        // This could happen if TMDB adds a new media_type we haven't defined
        console.warn(
          "Skipping invalid item in TMDB results:",
          itemValidation.error.errors,
        );
      }
    }
    // --- End Refined Filtering ---

    // console.log(`Validated and filtered ${validatedAndFilteredResults.length} results.`); // Optional debug log
    return validatedAndFilteredResults;
  } catch (error) {
    console.error("Error fetching or parsing TMDB data:", error);
    // Ensure the error is re-thrown so the Server Action catches it
    throw error;
  }
}

// Helper function to get the full image URL - unchanged
export function getTmdbImageUrl(
  path: string | null | undefined,
  size: string = "w500",
): string | null {
  if (!path) return null;
  const baseUrl =
    process.env.NEXT_PUBLIC_TMDB_IMAGE_BASE_URL ||
    "https://image.tmdb.org/t/p/";
  return `${baseUrl}${size}${path}`;
}
