// Pure schedule-range math, extracted from convex/schedule.ts so it can be
// unit-tested without the Convex runtime. All math happens on the UTC ms of
// a calendar day — TMDB air dates are plain dates and the client passes its
// own local week boundaries, so comparisons stay in the user's calendar
// days.

export const DAY_MS = 24 * 60 * 60 * 1000

// ISO date string → UTC ms of that calendar day. Returns null for anything
// that is not exactly YYYY-MM-DD.
export function parseDayMs(date: string | null): number | null {
  if (date === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const ms = Date.parse(`${date}T00:00:00Z`)
  return Number.isNaN(ms) ? null : ms
}

// An episode airing on a day inside [fromMs, toMs] — inclusive on both
// ends — belongs to the requested range. The range is the whole scheduling
// model now: the client passes the bounds of the week it is viewing.
export function inRange(airMs: number, fromMs: number, toMs: number): boolean {
  return airMs >= fromMs && airMs <= toMs
}
