import { notFound } from "next/navigation"
import { parseMediaId } from "@/lib/navigation"

export default async function ShowRecommendationsDrawer({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  if (parseMediaId((await params).id) === null) notFound()
  return null
}
