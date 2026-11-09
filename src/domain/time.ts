const AEST_OFFSET_MS = 10 * 60 * 60 * 1000;

function hhmm(date: Date): string {
  return date.toISOString().slice(11, 16);
}

/** "2026-11-09 22:00 AEST / 12:00 UTC" (AEST has no daylight saving). */
export function formatUtcAndAest(iso: string): string {
  const utc = new Date(iso);
  const aest = new Date(utc.getTime() + AEST_OFFSET_MS);
  const day = aest.toISOString().slice(0, 10);
  return `${day} ${hhmm(aest)} AEST / ${hhmm(utc)} UTC`;
}

/** "22:00 AEST", for compact forecast labels. */
export function formatAestTime(iso: string): string {
  return `${hhmm(new Date(new Date(iso).getTime() + AEST_OFFSET_MS))} AEST`;
}

/** Whole minutes from `iso` to `now`. */
export function minutesSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
}

/** "just now", "12 min ago", "3 h 5 min ago". */
export function formatAge(iso: string, now: Date): string {
  const minutes = minutesSince(iso, now);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min ago`;
}
