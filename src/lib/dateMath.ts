import type { RecurringFrequency } from "@/lib/types";

const DAY = 86_400_000;

function clampDay(year: number, month: number, day: number): Date {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay));
}

/** Pure date math for the recurring engine — handles short months safely. */
export function addInterval(
  from: Date,
  frequency: RecurringFrequency,
  intervalDays?: number | null
): Date {
  switch (frequency) {
    case "WEEKLY":
      return new Date(from.getTime() + 7 * DAY);
    case "MONTHLY":
      return clampDay(from.getFullYear(), from.getMonth() + 1, from.getDate());
    case "QUARTERLY":
      return clampDay(from.getFullYear(), from.getMonth() + 3, from.getDate());
    case "ANNUALLY":
      return clampDay(from.getFullYear() + 1, from.getMonth(), from.getDate());
    case "CUSTOM_DAYS":
      return new Date(from.getTime() + Math.max(1, intervalDays ?? 30) * DAY);
    default:
      return new Date(from.getTime() + 30 * DAY);
  }
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);
}
