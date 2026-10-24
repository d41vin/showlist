import { expect, test } from "vitest"
import {
  clearEntitySearch,
  entitySearchHref,
  readEntitySearch,
  type EntitySearch,
} from "./entity-search"

const person: EntitySearch = {
  kind: "person",
  id: "287",
  name: "Brad Pitt",
  credit: "cast",
}

function paramsFor(entity: EntitySearch, type: "movie" | "tv" = "movie") {
  return new URL(entitySearchHref(entity, type), "https://showlist.test")
    .searchParams
}

test("person links search combined credits rather than a title name", () => {
  const href = entitySearchHref(person, "movie")
  expect(href).toBe("/search?entity=person&id=287&name=Brad+Pitt&credit=cast")
  const params = paramsFor(person)
  expect(params.has("q")).toBe(false)
  expect(params.has("type")).toBe(false)
  expect(readEntitySearch(params)).toEqual(person)

  params.set("credit", "crew")
  expect(readEntitySearch(params)).toEqual({ ...person, credit: "crew" })
  params.delete("credit")
  expect(readEntitySearch(params)).toEqual(person)
})

test("parser accepts a read-only URLSearchParams-like getter", () => {
  const params = paramsFor(person)
  expect(readEntitySearch({ get: (key) => params.get(key) })).toEqual(person)
})

test.each(["movie", "tv"] as const)(
  "genre links retain their source media type %s",
  (type) => {
    const genre: EntitySearch = { kind: "genre", id: "28", name: "Action" }
    const params = paramsFor(genre, type)
    expect(params.get("type")).toBe(type)
    expect(readEntitySearch(params)).toEqual(genre)
    expect(entitySearchHref(genre, type)).toBe(
      `/search?entity=genre&id=28&name=Action&type=${type}`
    )
  }
)

test.each([null, "", "all", "movies", "MOVIE", "movie\n"])(
  "rejects a genre with unsupported media type %j",
  (type) => {
    const params = paramsFor({ kind: "genre", id: "28", name: "Action" })
    if (type === null) params.delete("type")
    else params.set("type", type)
    expect(readEntitySearch(params)).toBeNull()
  }
)

test.each([
  { kind: "company", id: "420", name: "Marvel Studios" },
  { kind: "country", id: "US", name: "United States of America" },
] satisfies EntitySearch[])(
  "$kind links start at the source media type and also permit all types",
  (entity) => {
    for (const type of ["movie", "tv"] as const) {
      const params = paramsFor(entity, type)
      expect(params.get("type")).toBe(type)
      expect(readEntitySearch(params)).toEqual(entity)
      params.set("type", "all")
      expect(readEntitySearch(params)).toEqual(entity)
      params.delete("type")
      expect(readEntitySearch(params)).toEqual(entity)
    }
  }
)

test.each([
  "",
  "q=Brad+Pitt",
  "entity=person",
  "id=287&name=Brad+Pitt",
  "entity=&id=287&name=Brad+Pitt",
  "entity=unknown&id=287&name=Brad+Pitt",
  "entity=Person&id=287&name=Brad+Pitt",
  "entity=person&id=287",
  "entity=person&id=287&name=",
  "entity=person&id=287&name=+++",
  "entity=person&id=%E0%A4%A&name=Brad+Pitt",
  "entity=person&id=287&name=Brad+Pitt&credit=director",
  "entity=person&id=287&name=Brad+Pitt&credit=",
  "entity=company&id=420&name=Marvel&credit=cast",
  "entity=country&id=US&name=USA&credit=crew",
  "entity=genre&id=28&name=Action&type=movie&credit=cast",
])("rejects absent or malformed entity parameters %j", (query) => {
  expect(readEntitySearch(new URLSearchParams(query))).toBeNull()
})

test.each([
  "",
  "0",
  "-1",
  "1.5",
  "01",
  "+1",
  "1e3",
  "0x10",
  "NaN",
  "Infinity",
  " 287",
  "287 ",
  "287\n",
  "287/movie",
  "9007199254740992",
])("rejects noncanonical numeric entity ID %j", (id) => {
  for (const kind of ["genre", "company", "person"] as const) {
    const params = paramsFor({ kind, id, name: "Name" })
    expect(readEntitySearch(params)).toBeNull()
  }
})

test.each(["1", "287", String(Number.MAX_SAFE_INTEGER)])(
  "accepts positive safe integer ID %s",
  (id) => {
    expect(readEntitySearch(paramsFor({ ...person, id }))?.id).toBe(id)
  }
)

test.each(["", "U", "USA", "us", "Us", "12", " US", "US ", "US\n", "US|GB"])(
  "rejects malformed uppercase ISO alpha-2 country ID %j",
  (id) => {
    expect(
      readEntitySearch(paramsFor({ kind: "country", id, name: "Country" }))
    ).toBeNull()
  }
)

test.each(["US", "GB", "FR", "KR"])("accepts country ID %s", (id) => {
  expect(
    readEntitySearch(paramsFor({ kind: "country", id, name: "Country" }))?.id
  ).toBe(id)
})

test("requires a nonblank display name of at most 200 characters", () => {
  const params = paramsFor(person)
  params.set("name", "  Brad Pitt  ")
  expect(readEntitySearch(params)?.name).toBe("Brad Pitt")
  params.set("name", "a".repeat(200))
  expect(readEntitySearch(params)?.name).toHaveLength(200)
  params.set("name", "a".repeat(201))
  expect(readEntitySearch(params)).toBeNull()
  expect(
    readEntitySearch(paramsFor({ ...person, name: "a".repeat(201) }))?.name
  ).toHaveLength(200)
})

test("encodes special characters without creating parameters or a fragment", () => {
  const entity = {
    ...person,
    name: 'A&B /? # + " <script> 李 &type=tv&credit=crew',
  }
  const url = new URL(entitySearchHref(entity, "tv"), "https://showlist.test")
  expect(url.origin).toBe("https://showlist.test")
  expect(url.pathname).toBe("/search")
  expect(url.hash).toBe("")
  expect(url.searchParams.get("name")).toBe(entity.name)
  expect(url.searchParams.has("type")).toBe(false)
  expect(url.searchParams.getAll("credit")).toEqual(["cast"])
  expect(readEntitySearch(url.searchParams)).toEqual(entity)
})

test("an invalid ID cannot inject URL filters through a generated link", () => {
  const params = paramsFor({ ...person, id: "287&type=tv#fragment" })
  expect(params.get("id")).toBe("287&type=tv#fragment")
  expect(params.has("type")).toBe(false)
  expect(readEntitySearch(params)).toBeNull()
})

test("clearing removes all entity fields but retains title and library filters", () => {
  const params = new URLSearchParams(
    "q=Matrix&type=movie&entity=person&id=287&name=Brad+Pitt&credit=cast" +
      "&entity=company&id=420&name=Marvel&credit=crew" +
      "&scope=library&status=watched&sentiment=liked&collection=list-1&sort=title"
  )
  clearEntitySearch(params)
  expect(params.toString()).toBe(
    "q=Matrix&type=movie&scope=library&status=watched&sentiment=liked&collection=list-1&sort=title"
  )
  clearEntitySearch(params)
  expect(params.get("q")).toBe("Matrix")
  expect(params.get("type")).toBe("movie")
})
