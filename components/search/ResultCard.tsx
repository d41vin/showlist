// components/search/ResultCard.tsx
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card"; // Using CardContent for padding below image
import { Button } from "@/components/ui/button";
import {
  TmdbSearchResult,
  MovieSearchResult,
  TvSearchResult,
  getTmdbImageUrl,
} from "@/lib/tmdb";
import {
  CheckCircle,
  Bookmark,
  ListPlus,
  ThumbsUp,
  ThumbsDown,
  Film, // Icon for Movie type
  Tv, // Icon for TV type
  ImageOff, // Placeholder if no poster
} from "lucide-react";

interface ResultCardProps {
  item: TmdbSearchResult;
  // Add props for state and actions later, e.g.:
  // isWatched?: boolean;
  // isOnWatchlist?: boolean;
  // onToggleWatched: (item: TmdbSearchResult) => void;
  // onToggleWatchlist: (item: TmdbSearchResult) => void;
  // onAddToList: (item: TmdbSearchResult) => void;
  // onRate: (item: TmdbSearchResult, rating: 'up' | 'down') => void;
}

export function ResultCard({ item }: ResultCardProps) {
  const imageUrl = getTmdbImageUrl(item.poster_path, "w342"); // Slightly smaller size for card view
  const title =
    item.media_type === "movie"
      ? (item as MovieSearchResult).title
      : (item as TvSearchResult).name;
  const dateString =
    item.media_type === "movie"
      ? (item as MovieSearchResult).release_date
      : (item as TvSearchResult).first_air_date;
  const year = dateString ? new Date(dateString).getFullYear() : "N/A";
  const typeDisplay = item.media_type === "movie" ? "Movie" : "TV Show";
  const TypeIcon = item.media_type === "movie" ? Film : Tv;

  // Placeholder functions for actions - replace later
  const handleWatchedClick = () => console.log("Toggle Watched:", item.id);
  const handleWatchlistClick = () => console.log("Toggle Watchlist:", item.id);
  const handleAddToListClick = () => console.log("Add to List:", item.id);
  const handleThumbsUpClick = () => console.log("Thumbs Up:", item.id);
  const handleThumbsDownClick = () => console.log("Thumbs Down:", item.id);

  return (
    <Card className="flex min-w-fit flex-col gap-0 overflow-hidden p-0">
      {/* Poster and Overlay Section */}
      <div className="bg-muted relative aspect-[2/3] w-full">
        {" "}
        {/* Aspect ratio 2:3 */}
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={`Poster for ${title}`}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" // Adjust sizes based on grid layout
            className="object-cover"
            priority={false} // Set to true only for above-the-fold critical images
          />
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center">
            <ImageOff size={48} />
          </div>
        )}
        {/* Overlay */}
        <div className="absolute right-0 bottom-0 left-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-3 text-white">
          <h3 className="line-clamp-2 text-lg leading-tight font-semibold">
            {title}
          </h3>
          <div className="mt-1 flex items-center text-xs opacity-80">
            <TypeIcon className="mr-1 h-3 w-3" />
            <span>
              {typeDisplay} • {year}
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons Section */}
      <CardContent className="min-w-max p-0">
        {/* Use CardContent for padding */}
        <div className="grid grid-cols-2">
          {/* Row 1 */}
          <Button
            variant="outline"
            size="sm"
            className="w-full min-w-max justify-center rounded-none p-1"
            onClick={handleWatchedClick}
          >
            <CheckCircle className="mr-0 h-4 w-4" />
            Watched
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full min-w-max justify-center rounded-none p-1"
            onClick={handleWatchlistClick}
          >
            <Bookmark className="mr-0 h-4 w-4" />
            Watchlist
          </Button>

          {/* Row 2 - Add to List (spans full width) */}
          <Button
            variant="outline"
            size="sm"
            className="col-span-2 w-full justify-center rounded-none"
            onClick={handleAddToListClick}
          >
            <ListPlus className="mr-0 h-4 w-4" />
            Add to List
          </Button>

          {/* Row 3 - Ratings */}
          <Button
            variant="outline"
            size="icon"
            className="w-full rounded-none"
            onClick={handleThumbsUpClick}
            aria-label="Rate up"
          >
            <ThumbsUp className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="w-full rounded-none"
            onClick={handleThumbsDownClick}
            aria-label="Rate down"
          >
            <ThumbsDown className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
