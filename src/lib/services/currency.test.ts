import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toBase } from "./currency";

describe("currency service - toBase", () => {
  it("converts local cents to base cents with a 1:1 exchange rate", () => {
    assert.strictEqual(toBase(1000, 1), 1000);
    assert.strictEqual(toBase(0, 1), 0);
  });

  it("converts local cents with exchange rate > 1.0", () => {
    assert.strictEqual(toBase(1000, 1.25), 1250);
    assert.strictEqual(toBase(500, 2.0), 1000);
  });

  it("converts local cents with exchange rate < 1.0", () => {
    assert.strictEqual(toBase(1000, 0.85), 850);
    assert.strictEqual(toBase(2000, 0.5), 1000);
  });

  it("rounds to nearest integer correctly for precision cases", () => {
    // 100 * 1.006 = 100.6 -> Math.round gives 101
    assert.strictEqual(toBase(100, 1.006), 101);
    // 100 * 1.004 = 100.4 -> Math.round gives 100
    assert.strictEqual(toBase(100, 1.004), 100);
    // 15 * 0.33 = 4.95 -> Math.round gives 5
    assert.strictEqual(toBase(15, 0.33), 5);
  });

  it("handles zero amounts and zero rates correctly", () => {
    assert.strictEqual(toBase(0, 1.5), 0);
    assert.strictEqual(toBase(1000, 0), 0);
  });

  it("handles negative amounts (e.g. credit notes or refunds)", () => {
    assert.strictEqual(toBase(-1000, 1.25), -1250);
    assert.strictEqual(toBase(-500, 0.8), -400);
  });

  it("handles large amounts without precision loss", () => {
    // $1,000,000.00 (100,000,000 cents) * 1.123456
    assert.strictEqual(toBase(100_000_000, 1.123456), 112_345_600);
  });
});
