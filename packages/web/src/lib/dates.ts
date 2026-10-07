// Small date helpers. Dates are stored as ISO strings ("2026-09-22") so they
// sort correctly as text and survive JSON (and SQLite) unchanged.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's local date as "YYYY-MM-DD". */
export function today(): string {
  return toIsoDate(new Date());
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse "YYYY-MM-DD" as a local date (new Date("2026-09-22") would be UTC midnight). */
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

export function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseIsoDate(b).getTime() - parseIsoDate(a).getTime()) / DAY_MS);
}

/** Sprint end date is worked out from its length, as the design doc says. */
export function sprintEndDate(startDate: string, lengthWeeks: 1 | 2): string {
  return addDays(startDate, lengthWeeks * 7 - 1);
}

/** "Sep 22" */
export function formatShort(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Sep 22 to Oct 3" */
export function formatRange(start: string, end: string): string {
  return `${formatShort(start)} to ${formatShort(end)}`;
}

/** "Sep 22" for a full timestamp, in local time (slicing the ISO string would give the UTC day). */
export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
