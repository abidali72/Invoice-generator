import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { addInterval, startOfDay, daysBetween } from "./dateMath";
import type { RecurringFrequency } from "./types";

describe("addInterval", () => {
  describe("WEEKLY frequency", () => {
    test("adds 7 days to a standard date", () => {
      const from = new Date(2025, 0, 1); // Jan 1, 2025
      const result = addInterval(from, "WEEKLY");
      assert.equal(result.getFullYear(), 2025);
      assert.equal(result.getMonth(), 0);
      assert.equal(result.getDate(), 8);
    });

    test("handles month boundary transitions", () => {
      const from = new Date(2025, 0, 28); // Jan 28, 2025
      const result = addInterval(from, "WEEKLY");
      assert.equal(result.getFullYear(), 2025);
      assert.equal(result.getMonth(), 1); // Feb
      assert.equal(result.getDate(), 4);
    });

    test("handles leap year February", () => {
      const from = new Date(2024, 1, 25); // Feb 25, 2024 (leap year)
      const result = addInterval(from, "WEEKLY");
      assert.equal(result.getFullYear(), 2024);
      assert.equal(result.getMonth(), 2); // March
      assert.equal(result.getDate(), 3);
    });
  });

  describe("MONTHLY frequency", () => {
    test("adds 1 month to standard date", () => {
      const from = new Date(2025, 0, 15); // Jan 15, 2025
      const result = addInterval(from, "MONTHLY");
      assert.equal(result.getFullYear(), 2025);
      assert.equal(result.getMonth(), 1); // Feb
      assert.equal(result.getDate(), 15);
    });

    test("clamps day to end of month for short months (Jan 31 -> Feb 28)", () => {
      const from = new Date(2025, 0, 31); // Jan 31, 2025 (non-leap year)
      const result = addInterval(from, "MONTHLY");
      assert.equal(result.getFullYear(), 2025);
      assert.equal(result.getMonth(), 1); // Feb
      assert.equal(result.getDate(), 28);
    });

    test("clamps day to end of month in leap year (Jan 31 -> Feb 29)", () => {
      const from = new Date(2024, 0, 31); // Jan 31, 2024 (leap year)
      const result = addInterval(from, "MONTHLY");
      assert.equal(result.getFullYear(), 2024);
      assert.equal(result.getMonth(), 1); // Feb
      assert.equal(result.getDate(), 29);
    });

    test("handles year rollover (Dec 15 -> Jan 15)", () => {
      const from = new Date(2024, 11, 15); // Dec 15, 2024
      const result = addInterval(from, "MONTHLY");
      assert.equal(result.getFullYear(), 2025);
      assert.equal(result.getMonth(), 0); // Jan
      assert.equal(result.getDate(), 15);
    });

    test("handles year rollover with day clamping (Dec 31 -> Jan 31)", () => {
      const from = new Date(2024, 11, 31); // Dec 31, 2024
      const result = addInterval(from, "MONTHLY");
      assert.equal(result.getFullYear(), 2025);
      assert.equal(result.getMonth(), 0); // Jan
      assert.equal(result.getDate(), 31);
    });

    test("clamps Aug 31 to Sep 30", () => {
      const from = new Date(2025, 7, 31); // Aug 31, 2025
      const result = addInterval(from, "MONTHLY");
      assert.equal(result.getFullYear(), 2025);
      assert.equal(result.getMonth(), 8); // Sep
      assert.equal(result.getDate(), 30);
    });
  });

  describe("QUARTERLY frequency", () => {
    test("adds 3 months to standard date", () => {
      const from = new Date(2025, 0, 15); // Jan 15, 2025
      const result = addInterval(from, "QUARTERLY");
      assert.equal(result.getFullYear(), 2025);
      assert.equal(result.getMonth(), 3); // Apr
      assert.equal(result.getDate(), 15);
    });

    test("clamps day to end of month across quarter boundary (Nov 30 -> Feb 28)", () => {
      const from = new Date(2024, 10, 30); // Nov 30, 2024
      const result = addInterval(from, "QUARTERLY");
      assert.equal(result.getFullYear(), 2025);
      assert.equal(result.getMonth(), 1); // Feb
      assert.equal(result.getDate(), 28);
    });

    test("handles year boundary crossover (Oct 15 -> Jan 15 next year)", () => {
      const from = new Date(2024, 9, 15); // Oct 15, 2024
      const result = addInterval(from, "QUARTERLY");
      assert.equal(result.getFullYear(), 2025);
      assert.equal(result.getMonth(), 0); // Jan
      assert.equal(result.getDate(), 15);
    });
  });

  describe("ANNUALLY frequency", () => {
    test("adds 1 year to standard date", () => {
      const from = new Date(2025, 4, 20); // May 20, 2025
      const result = addInterval(from, "ANNUALLY");
      assert.equal(result.getFullYear(), 2026);
      assert.equal(result.getMonth(), 4);
      assert.equal(result.getDate(), 20);
    });

    test("clamps Feb 29 on leap year to Feb 28 on non-leap year", () => {
      const from = new Date(2024, 1, 29); // Feb 29, 2024
      const result = addInterval(from, "ANNUALLY");
      assert.equal(result.getFullYear(), 2025);
      assert.equal(result.getMonth(), 1); // Feb
      assert.equal(result.getDate(), 28);
    });
  });

  describe("CUSTOM_DAYS frequency", () => {
    test("adds custom specified days", () => {
      const from = new Date(2025, 0, 1);
      const result = addInterval(from, "CUSTOM_DAYS", 10);
      assert.equal(result.getFullYear(), 2025);
      assert.equal(result.getMonth(), 0);
      assert.equal(result.getDate(), 11);
    });

    test("defaults to 30 days when intervalDays is null", () => {
      const from = new Date(2025, 0, 1);
      const result = addInterval(from, "CUSTOM_DAYS", null);
      assert.equal(result.getFullYear(), 2025);
      assert.equal(result.getMonth(), 0);
      assert.equal(result.getDate(), 31);
    });

    test("defaults to 30 days when intervalDays is undefined", () => {
      const from = new Date(2025, 0, 1);
      const result = addInterval(from, "CUSTOM_DAYS");
      assert.equal(result.getFullYear(), 2025);
      assert.equal(result.getMonth(), 0);
      assert.equal(result.getDate(), 31);
    });

    test("enforces minimum 1 day when intervalDays <= 0", () => {
      const from = new Date(2025, 0, 1);
      const resultZero = addInterval(from, "CUSTOM_DAYS", 0);
      assert.equal(resultZero.getDate(), 2);

      const resultNegative = addInterval(from, "CUSTOM_DAYS", -5);
      assert.equal(resultNegative.getDate(), 2);
    });
  });

  describe("Unrecognized frequency fallback", () => {
    test("defaults to adding 30 days for unknown frequency", () => {
      const from = new Date(2025, 0, 1);
      const result = addInterval(from, "UNKNOWN" as RecurringFrequency);
      assert.equal(result.getFullYear(), 2025);
      assert.equal(result.getMonth(), 0);
      assert.equal(result.getDate(), 31);
    });
  });
});

describe("startOfDay", () => {
  test("resets time components to midnight (00:00:00.000)", () => {
    const input = new Date(2025, 5, 15, 14, 30, 45, 500);
    const result = startOfDay(input);
    assert.equal(result.getFullYear(), 2025);
    assert.equal(result.getMonth(), 5);
    assert.equal(result.getDate(), 15);
    assert.equal(result.getHours(), 0);
    assert.equal(result.getMinutes(), 0);
    assert.equal(result.getSeconds(), 0);
    assert.equal(result.getMilliseconds(), 0);
  });

  test("does not mutate original date object", () => {
    const input = new Date(2025, 5, 15, 14, 30, 45, 500);
    const timeBefore = input.getTime();
    const result = startOfDay(input);
    assert.equal(input.getTime(), timeBefore);
    assert.notEqual(result, input);
  });
});

describe("daysBetween", () => {
  test("returns 0 for the same date", () => {
    const d1 = new Date(2025, 0, 10, 10, 0, 0);
    const d2 = new Date(2025, 0, 10, 18, 30, 0);
    assert.equal(daysBetween(d1, d2), 0);
  });

  test("returns positive integer when second date is in the future", () => {
    const d1 = new Date(2025, 0, 1, 0, 0, 0);
    const d2 = new Date(2025, 0, 11, 23, 59, 59);
    assert.equal(daysBetween(d1, d2), 10);
  });

  test("returns negative integer when second date is in the past", () => {
    const d1 = new Date(2025, 0, 11, 12, 0, 0);
    const d2 = new Date(2025, 0, 1, 12, 0, 0);
    assert.equal(daysBetween(d1, d2), -10);
  });

  test("ignores time of day across consecutive days", () => {
    const d1 = new Date(2025, 0, 1, 23, 59, 59);
    const d2 = new Date(2025, 0, 2, 0, 0, 1);
    assert.equal(daysBetween(d1, d2), 1);
  });
});
