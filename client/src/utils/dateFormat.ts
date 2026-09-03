function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Midnight of `date`'s calendar day, in local time - used to group items by day and to compare against "today"/"yesterday". */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** "Today" / "Yesterday" / "DD.MM.YYYY" label for the calendar day `day` falls on. */
export function formatDayLabel(day: Date): string {
  const today = startOfDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (day.getTime() === today.getTime()) return "Today";
  if (day.getTime() === yesterday.getTime()) return "Yesterday";
  return `${pad(day.getDate())}.${pad(day.getMonth() + 1)}.${day.getFullYear()}`;
}

/** "HH:MM" (locale-formatted) for a given ISO timestamp. */
export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}
