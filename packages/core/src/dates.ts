// Calendar dates as "YYYY-MM-DD" strings, done in UTC so the result never
// depends on the machine's time zone or daylight saving changes.

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A sprint's last day: start plus its length, as the design doc says. */
export function sprintEndDate(startDate: string, lengthWeeks: number): string {
  return addDays(startDate, lengthWeeks * 7 - 1);
}
