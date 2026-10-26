"use client"

import type { FunctionReturnType } from "convex/server"
import Link from "next/link"
import { useId, type ReactNode } from "react"

import {
  useNavigationState,
  useRetainedState,
} from "@/components/navigation-state"
import type { ShowDetails } from "@/components/title-details"
import { Button } from "@/components/ui/button"
import type { api } from "@/convex/_generated/api"
import { entitySearchHref, type EntitySearch } from "@/lib/entity-search"
import type { MediaItem, MediaType } from "@/lib/media"

export type TitleExtras = FunctionReturnType<typeof api.tmdb.titleExtras>
type PersonCredit = NonNullable<TitleExtras>["cast"][number]

export function TitleMetadata({
  item,
  data,
  extras,
  failed,
  loading,
  onRetry,
  onNavigate,
}: {
  item: MediaItem
  data: ShowDetails
  extras: TitleExtras | undefined
  failed: boolean
  loading: boolean
  onRetry: () => void
  onNavigate: () => void
}) {
  const { captureSearchOrigin } = useNavigationState()
  const storageKey = `title:${item.mediaType}:${item.tmdbId}:metadata`
  const [open, setOpen] = useRetainedState(storageKey, false)
  const releaseDate = formatReleaseDate(data.releaseDate)
  const navigate = () => {
    captureSearchOrigin()
    onNavigate()
  }

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="px-6 pb-4"
    >
      <summary className="cursor-pointer text-sm font-medium">
        More details
      </summary>
      <dl className="mt-3 space-y-3 text-sm">
        <MetadataRow label="TMDB rating">
          {data.voteAverage !== null && Number.isFinite(data.voteAverage)
            ? `${data.voteAverage.toFixed(1)} / 10`
            : "Unavailable"}
        </MetadataRow>
        <MetadataRow
          label={item.mediaType === "movie" ? "Release date" : "First aired"}
        >
          {releaseDate ? (
            <time dateTime={data.releaseDate!}>{releaseDate}</time>
          ) : (
            "Unavailable"
          )}
        </MetadataRow>
        {item.mediaType === "movie" &&
          data.runtime !== null &&
          Number.isFinite(data.runtime) &&
          data.runtime > 0 && (
            <MetadataRow label="Runtime">{data.runtime} min</MetadataRow>
          )}
        {extras?.genres.length ? (
          <MetadataRow label="Genres">
            <EntityLinks
              entities={extras.genres.map((genre) => ({
                kind: "genre",
                id: String(genre.id),
                name: genre.name,
              }))}
              mediaType={item.mediaType}
              onNavigate={navigate}
            />
          </MetadataRow>
        ) : data.genres.length > 0 ? (
          <MetadataRow label="Genres">{data.genres.join(", ")}</MetadataRow>
        ) : null}
        {extras && (
          <>
            {extras.alternativeTitles.length > 0 && (
              <MetadataRow label="Also known as">
                {extras.alternativeTitles.join(" · ")}
              </MetadataRow>
            )}
            {extras.countries.length > 0 && (
              <MetadataRow label="Countries">
                <EntityLinks
                  entities={extras.countries.map((country) => ({
                    kind: "country",
                    id: country.code,
                    name: country.name,
                  }))}
                  mediaType={item.mediaType}
                  onNavigate={navigate}
                />
              </MetadataRow>
            )}
            {extras.companies.length > 0 && (
              <MetadataRow label="Companies">
                <EntityLinks
                  entities={extras.companies.map((company) => ({
                    kind: "company",
                    id: String(company.id),
                    name: company.name,
                  }))}
                  mediaType={item.mediaType}
                  onNavigate={navigate}
                />
              </MetadataRow>
            )}
            {extras.cast.length > 0 && (
              <MetadataRow label="Cast">
                <PeopleList
                  people={extras.cast}
                  credit="cast"
                  storageKey={`${storageKey}:cast`}
                  mediaType={item.mediaType}
                  onNavigate={navigate}
                />
              </MetadataRow>
            )}
            {extras.crew.length > 0 && (
              <MetadataRow label="Crew">
                <PeopleList
                  people={extras.crew}
                  credit="crew"
                  storageKey={`${storageKey}:crew`}
                  mediaType={item.mediaType}
                  onNavigate={navigate}
                />
              </MetadataRow>
            )}
          </>
        )}
      </dl>
      {failed || extras === null ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p role="status" className="text-sm text-muted-foreground">
            {failed
              ? "Couldn’t load additional details and artwork."
              : "Additional details and artwork are unavailable."}
          </p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry details
          </Button>
        </div>
      ) : loading ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          Loading additional details and artwork…
        </p>
      ) : null}
    </details>
  )
}

function MetadataRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 grow basis-48 break-words">{children}</dd>
    </div>
  )
}

function EntityLinks({
  entities,
  mediaType,
  onNavigate,
}: {
  entities: EntitySearch[]
  mediaType: MediaType
  onNavigate: () => void
}) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1">
      {entities.map((entity) => (
        <li key={entity.id} className="max-w-full min-w-0">
          <Link
            href={entitySearchHref(entity, mediaType)}
            onNavigate={onNavigate}
            className="underline underline-offset-4"
          >
            {entity.name}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function PeopleList({
  people,
  credit,
  storageKey,
  mediaType,
  onNavigate,
}: {
  people: PersonCredit[]
  credit: "cast" | "crew"
  storageKey: string
  mediaType: MediaType
  onNavigate: () => void
}) {
  const [expanded, setExpanded] = useRetainedState(storageKey, false)
  const listId = useId()
  const visible = expanded ? people : people.slice(0, 10)
  const list = (
    <ul id={listId} className="flex flex-wrap gap-x-3 gap-y-1">
      {visible.map((person) => (
        <li key={person.id} className="max-w-full min-w-0">
          <Link
            href={entitySearchHref(
              {
                kind: "person",
                id: String(person.id),
                name: person.name,
                credit,
              },
              mediaType
            )}
            title={person.role || undefined}
            onNavigate={onNavigate}
            className="underline underline-offset-4"
          >
            {person.name}
          </Link>
        </li>
      ))}
    </ul>
  )

  return (
    <>
      {expanded && people.length > 10 ? (
        <div
          tabIndex={0}
          role="group"
          aria-label={`Full ${credit} list`}
          className="max-h-64 [scrollbar-width:thin] [scrollbar-color:color-mix(in_oklch,var(--foreground)_20%,transparent)_transparent] overflow-y-auto overscroll-contain rounded-lg border border-border/60 p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {list}
        </div>
      ) : (
        list
      )}
      {people.length > 10 && (
        <Button
          variant="link"
          size="sm"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-label={
            expanded
              ? `Show less ${credit}`
              : `Show ${people.length - 10} more ${credit} members`
          }
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : `${people.length - 10} more`}
        </Button>
      )}
    </>
  )
}

function formatReleaseDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    return null
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(date)
}
