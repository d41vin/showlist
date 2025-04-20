// components/ShowCard.tsx

import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

interface ShowCardProps {
  title: string;
  year: number;
  type: "Movie" | "TV";
  posterUrl?: string;
  onWatchlist?: () => void;
  onWatched?: () => void;
  onAddToList?: (listName: string) => void;
}

export default function ShowCard({
  title,
  year,
  type,
  posterUrl,
  onWatchlist,
  onWatched,
  onAddToList,
}: ShowCardProps) {
  const lists = ["Holiday Picks", "Rewatch List", "+ New List"];

  return (
    <div className="w-[250px] overflow-hidden rounded-xl bg-zinc-900 text-white shadow-lg">
      <div className="relative flex h-[360px] items-end justify-center bg-gradient-to-br from-pink-500 to-yellow-400">
        {posterUrl && (
          <Image
            src={posterUrl}
            alt={`${title} poster`}
            layout="fill"
            objectFit="cover"
            className="absolute top-0 left-0"
          />
        )}
        <div className="relative z-10 w-full bg-black/50 py-2 text-center text-sm font-semibold">
          {title} ({year})<br />
          {type}
        </div>
      </div>

      <div className="flex flex-col gap-3 p-4">
        <div className="flex gap-2">
          <Button className="flex-1" variant="secondary" onClick={onWatched}>
            ✅ Watched
          </Button>
          <Button className="flex-1" variant="secondary" onClick={onWatchlist}>
            📌 Watchlist
          </Button>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" className="w-full text-left">
              📂 Add to Custom List
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {lists.map((list, idx) => (
              <DropdownMenuItem key={idx} onClick={() => onAddToList?.(list)}>
                {list}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
