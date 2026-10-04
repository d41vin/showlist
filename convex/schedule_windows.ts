// Pure schedule-window math, extracted from convex/schedule.ts so it can be
// unit-tested without the Convex runtime. All window math happens on the UTC
// ms of a calendar day — TMDB air dates are plain dates and the client passes
// its own local "today", so comparisons stay in the user's calendar day.

export const DAY_MS = 24 * 60 * 60 * 1000

// How far ahead to look for airing episodes, and how far back for catch-up.
export const UPCOMING_DAYS = 30
export const RECENT_DAYS = 8

// ISO date string → UTC ms of that calendar day. Returns null for anything
// that is not exactly YYYY-MM-DD.
export function parseDayMs(date: string | null): number | null {
  if (date === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const ms = Date.parse(`${date}T00:00:00Z`)
  return Number.isNaN(ms) ? null : ms
}

// An episode airing today or within the next UPCOMING_DAYS counts as
// upcoming (end-exclusive at today + UPCOMING_DAYS + 1).
export function isUpcoming(airMs: number, todayMs: number): boolean {
  return airMs >= todayMs && airMs < todayMs + (UPCOMING_DAYS + 1) * DAY_MS
}

// An episode aired within the last RECENT_DAYS (exclusive of today) counts
// as catch-up material.
export function isRecent(airMs: number, todayMs: number): boolean {
  return airMs >= todayMs - RECENT_DAYS * DAY_MS && airMs < todayMs
}
