import { notFound } from "next/navigation"
import { TitleRoute } from "@/components/title-route"
import { parseMediaId } from "@/lib/navigation"

export default async function MovieRecommendations({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const id = parseMediaId((await params).id)
  if (id === null) notFound()
  return <TitleRoute mediaType="movie" tmdbId={id} recommendations />
}
