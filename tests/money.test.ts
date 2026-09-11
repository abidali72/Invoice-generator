import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
  clamp,
  formatMoney,
  formatMoneyBase,
  formatPercent,
  trimNum,
  toCents,
  centsToDecimalString,
  roundCent,
} from "../src/lib/money.ts";

describe("clamp", () => {
  test("returns number within range unchanged", () => {
    assert.equal(clamp(5, 0, 10), 5);
    assert.equal(clamp(0, 0, 10), 0);
    assert.equal(clamp(10, 0, 10), 10);
  });

  test("clamps number below minimum", () => {
    assert.equal(clamp(-5, 0, 10), 0);
    assert.equal(clamp(-100, -50, 50), -50);
  });

  test("clamps number above maximum", () => {
    assert.equal(clamp(15, 0, 10), 10);
    assert.equal(clamp(100, -50, 50), 50);
  });

  test("handles min equal to max", () => {
    assert.equal(clamp(5, 10, 10), 10);
    assert.equal(clamp(15, 10, 10), 10);
  });

  test("handles negative bounds", () => {
    assert.equal(clamp(-15, -20, -10), -15);
    assert.equal(clamp(-25, -20, -10), -20);
    assert.equal(clamp(-5, -20, -10), -10);
  });
});

describe("roundCent", () => {
  test("rounds positive floating numbers to nearest integer cent", () => {
    assert.equal(roundCent(100.4), 100);
    assert.equal(roundCent(100.5), 101);
    assert.equal(roundCent(100.6), 101);
  });

  test("handles exact integers", () => {
    assert.equal(roundCent(0), 0);
    assert.equal(roundCent(2500), 2500);
  });

  test("handles negative values", () => {
    assert.equal(roundCent(-100.4), -100);
    assert.equal(roundCent(-100.6), -101);
  });
});

describe("formatMoney & formatMoneyBase", () => {
  test("formats USD by default in en-US", () => {
    const formatted = formatMoney(1234);
    assert.equal(formatted, "$12.34");
  });

  test("formats zero cents", () => {
    assert.equal(formatMoney(0), "$0.00");
  });

  test("formats negative cents", () => {
    const formatted = formatMoney(-1234);
    assert.ok(formatted.includes("12.34"));
  });

  test("formats other currencies and locales", () => {
    const eur = formatMoney(1234, "EUR", "de-DE");
    // German locale uses dot/comma formatting e.g. 12,34 € or €12.34 depending on node ICUs
    assert.ok(eur.includes("12,34") || eur.includes("12.34"));
    assert.ok(eur.includes("€") || eur.includes("EUR"));
  });

  test("falls back to string formatting when Intl throws", () => {
    const result = formatMoney(1234, "INVALID_CURRENCY");
    assert.equal(result, "INVALID_CURRENCY 12.34");
  });

  test("formatMoneyBase delegates to formatMoney", () => {
    assert.equal(formatMoneyBase(500), formatMoney(500));
    assert.equal(formatMoneyBase(500, "EUR", "en-US"), formatMoney(500, "EUR", "en-US"));
  });
});

describe("trimNum & formatPercent", () => {
  test("trimNum formats integer values without decimals", () => {
    assert.equal(trimNum(10), "10");
    assert.equal(trimNum(0), "0");
    assert.equal(trimNum(-5), "-5");
  });

  test("trimNum rounds floats to at most 2 decimal places", () => {
    assert.equal(trimNum(10.5), "10.5");
    assert.equal(trimNum(10.567), "10.57");
    assert.equal(trimNum(10.1234), "10.12");
  });

  test("formatPercent appends % to trimmed number", () => {
    assert.equal(formatPercent(20), "20%");
    assert.equal(formatPercent(8.25), "8.25%");
    assert.equal(formatPercent(8.256), "8.26%");
  });
});

describe("toCents", () => {
  test("converts number directly to cents", () => {
    assert.equal(toCents(12.34), 1234);
    assert.equal(toCents(0), 0);
    assert.equal(toCents(9.999), 1000);
  });

  test("parses string numbers into cents", () => {
    assert.equal(toCents("12.34"), 1234);
    assert.equal(toCents("1234.5"), 123450);
    assert.equal(toCents("0.05"), 5);
  });

  test("cleans formatted currency strings", () => {
    assert.equal(toCents("$1,234.50"), 123450);
    assert.equal(toCents("€ 99.90"), 9990);
    assert.equal(toCents("-15.25"), -1525);
  });

  test("handles invalid numeric strings gracefully", () => {
    assert.equal(toCents("abc"), 0);
    assert.equal(toCents(""), 0);
  });
});

describe("centsToDecimalString", () => {
  test("converts integer cents to standard 2-decimal string", () => {
    assert.equal(centsToDecimalString(1234), "12.34");
    assert.equal(centsToDecimalString(5), "0.05");
    assert.equal(centsToDecimalString(0), "0.00");
    assert.equal(centsToDecimalString(-1234), "-12.34");
  });
});
