import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");

  if (!query) return NextResponse.json({ results: [] });

  const res = await fetch(
    `https://api.themoviedb.org/3/search/multi?query=${query}&include_adult=false&language=en-US&page=1`,
    {
      headers: {
        Authorization: `Bearer ${process.env.TMDB_API_KEY}`,
      },
    },
  );

  const data = await res.json();
  const filtered = data.results?.filter((item: any) =>
    ["movie", "tv"].includes(item.media_type),
  );

  return NextResponse.json({ results: filtered });
}
