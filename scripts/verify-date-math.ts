/**
 * Verification suite for src/lib/dateMath.ts.
 * Runs on bare Node 24 (native TS type-stripping):
 *   node --experimental-strip-types scripts/verify-date-math.ts
 */
import { addInterval, startOfDay, daysBetween } from "../src/lib/dateMath.ts";
import type { RecurringFrequency } from "../src/lib/types.ts";

let failures = 0;
function check(name: string, cond: boolean) {
  if (!cond) {
    failures += 1;
    console.error(`  ✗ ${name}`);
  }
}

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/* ── WEEKLY ── */
{
  const start = new Date(2025, 0, 15); // Jan 15, 2025
  const next = addInterval(start, "WEEKLY");
  check("WEEKLY adds exactly 7 days", formatDate(next) === "2025-01-22");
}

/* ── MONTHLY & Short month clamping ── */
{
  // Normal month transition
  const Jan15 = new Date(2025, 0, 15);
  check("MONTHLY Jan 15 -> Feb 15", formatDate(addInterval(Jan15, "MONTHLY")) === "2025-02-15");

  // Short month clamping (Jan 31 -> Feb 28 in non-leap year)
  const Jan31 = new Date(2025, 0, 31);
  check("MONTHLY Jan 31 -> Feb 28 (non-leap year)", formatDate(addInterval(Jan31, "MONTHLY")) === "2025-02-28");

  // Short month clamping (Jan 31 -> Feb 29 in leap year)
  const Jan31_2024 = new Date(2024, 0, 31);
  check("MONTHLY Jan 31 -> Feb 29 (leap year)", formatDate(addInterval(Jan31_2024, "MONTHLY")) === "2024-02-29");

  // Short month clamping (Aug 31 -> Sep 30)
  const Aug31 = new Date(2025, 7, 31);
  check("MONTHLY Aug 31 -> Sep 30", formatDate(addInterval(Aug31, "MONTHLY")) === "2025-09-30");
}

/* ── QUARTERLY ── */
{
  const Jan15 = new Date(2025, 0, 15);
  check("QUARTERLY Jan 15 -> Apr 15", formatDate(addInterval(Jan15, "QUARTERLY")) === "2025-04-15");

  // Clamping in quarterly addition (Nov 30 -> Feb 28 of next year)
  const Nov30 = new Date(2024, 10, 30);
  check("QUARTERLY Nov 30 2024 -> Feb 28 2025", formatDate(addInterval(Nov30, "QUARTERLY")) === "2025-02-28");

  // Aug 31 -> Nov 30
  const Aug31 = new Date(2025, 7, 31);
  check("QUARTERLY Aug 31 -> Nov 30", formatDate(addInterval(Aug31, "QUARTERLY")) === "2025-11-30");
}

/* ── ANNUALLY ── */
{
  const Jan15 = new Date(2025, 0, 15);
  check("ANNUALLY Jan 15 2025 -> Jan 15 2026", formatDate(addInterval(Jan15, "ANNUALLY")) === "2026-01-15");

  // Leap year Feb 29 -> Feb 28 non-leap year
  const Feb29_2024 = new Date(2024, 1, 29);
  check("ANNUALLY Feb 29 2024 -> Feb 28 2025", formatDate(addInterval(Feb29_2024, "ANNUALLY")) === "2025-02-28");
}

/* ── CUSTOM_DAYS ── */
{
  const Jan1 = new Date(2025, 0, 1);
  check("CUSTOM_DAYS 10 days", formatDate(addInterval(Jan1, "CUSTOM_DAYS", 10)) === "2025-01-11");
  check("CUSTOM_DAYS default fallback (null) is 30 days", formatDate(addInterval(Jan1, "CUSTOM_DAYS", null)) === "2025-01-31");
  check("CUSTOM_DAYS default fallback (undefined) is 30 days", formatDate(addInterval(Jan1, "CUSTOM_DAYS")) === "2025-01-31");
  check("CUSTOM_DAYS 0 or negative clamped to min 1 day", formatDate(addInterval(Jan1, "CUSTOM_DAYS", 0)) === "2025-01-02");
  check("CUSTOM_DAYS negative clamped to min 1 day", formatDate(addInterval(Jan1, "CUSTOM_DAYS", -5)) === "2025-01-02");
}

/* ── Fallback / Unknown Frequency ── */
{
  const Jan1 = new Date(2025, 0, 1);
  check("Default fallback frequency is 30 days", formatDate(addInterval(Jan1, "UNKNOWN" as RecurringFrequency)) === "2025-01-31");
}

/* ── startOfDay ── */
{
  const dateWithTime = new Date(2025, 5, 15, 14, 30, 45, 500);
  const start = startOfDay(dateWithTime);
  check(
    "startOfDay resets hours, minutes, seconds, milliseconds to 0",
    start.getHours() === 0 && start.getMinutes() === 0 && start.getSeconds() === 0 && start.getMilliseconds() === 0
  );
  check("startOfDay preserves date year/month/day", formatDate(start) === "2025-06-15");
}

/* ── daysBetween ── */
{
  const d1 = new Date(2025, 0, 1, 10, 0, 0);
  const d2 = new Date(2025, 0, 10, 18, 0, 0);
  check("daysBetween calculates correct positive difference", daysBetween(d1, d2) === 9);
  check("daysBetween handles negative difference", daysBetween(d2, d1) === -9);
  check("daysBetween same day is 0", daysBetween(d1, d1) === 0);
}

if (failures > 0) {
  console.error(`\nFAILURES: ${failures}`);
  process.exit(1);
}
console.log("✓ all date math verification tests pass");
