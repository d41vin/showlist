import { parseMediaId } from "./navigation"

export type EntitySearch = {
  kind: "genre" | "country" | "company" | "person"
  id: string
  name: string
  credit?: "cast" | "crew"
}

export function readEntitySearch(
  params: Pick<URLSearchParams, "get">
): EntitySearch | null {
  const kind = params.get("entity")
  const id = params.get("id")
  const name = params.get("name")
  const credit = params.get("credit")
  if (
    (kind !== "genre" &&
      kind !== "country" &&
      kind !== "company" &&
      kind !== "person") ||
    !id ||
    !name?.trim() ||
    name.length > 200
  )
    return null

  if (
    kind === "country"
      ? id.length !== 2 || !/^[A-Z]{2}$/.test(id)
      : parseMediaId(id) === null
  )
    return null

  if (
    kind === "genre" &&
    params.get("type") !== "movie" &&
    params.get("type") !== "tv"
  )
    return null

  if (kind === "person") {
    if (credit !== null && credit !== "cast" && credit !== "crew") return null
    return { kind, id, name: name.trim(), credit: credit ?? "cast" }
  }
  if (credit !== null) return null
  return { kind, id, name: name.trim() }
}

export function entitySearchHref(
  entity: EntitySearch,
  mediaType: "movie" | "tv"
) {
  const params = new URLSearchParams({
    entity: entity.kind,
    id: entity.id,
    name: entity.name.trim().slice(0, 200),
  })
  if (entity.kind === "person") params.set("credit", entity.credit ?? "cast")
  else params.set("type", mediaType)
  return `/search?${params}`
}

export function clearEntitySearch(params: Pick<URLSearchParams, "delete">) {
  for (const key of ["entity", "id", "name", "credit"]) params.delete(key)
}
