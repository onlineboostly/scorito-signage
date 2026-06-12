const TZ = 'Europe/Amsterdam';

/** "14:32" in Dutch local time, regardless of where the server runs. */
export function formatClock(date: Date): string {
  return new Intl.DateTimeFormat('nl-NL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  }).format(date);
}

/** "Vrijdag 12 juni" — capitalized for display. */
export function formatLongDate(date: Date): string {
  const s = new Intl.DateTimeFormat('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: TZ,
  }).format(date);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** 1234 -> "1.234" */
export function formatPoints(points: number): string {
  return new Intl.NumberFormat('nl-NL').format(points);
}

/** Parse a yyyy-mm-dd snapshot date safely (noon UTC avoids timezone day-shifts). */
export function parseIsoDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
