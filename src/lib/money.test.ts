import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  roundCent,
  clamp,
  allocateProportionally,
  computeInvoice,
  formatMoney,
  formatMoneyBase,
  formatPercent,
  trimNum,
  toCents,
  centsToDecimalString,
  type CalcItemInput,
} from "./money.ts";

describe("money - roundCent", () => {
  it("rounds positive floats to nearest integer cent", () => {
    assert.equal(roundCent(100.4), 100);
    assert.equal(roundCent(100.5), 101);
    assert.equal(roundCent(100.6), 101);
  });

  it("handles exact integers", () => {
    assert.equal(roundCent(500), 500);
    assert.equal(roundCent(0), 0);
  });
});

describe("money - clamp", () => {
  it("clamps values below minimum", () => {
    assert.equal(clamp(-10, 0, 100), 0);
  });

  it("clamps values above maximum", () => {
    assert.equal(clamp(150, 0, 100), 100);
  });

  it("returns value within range", () => {
    assert.equal(clamp(50, 0, 100), 50);
  });
});

describe("money - allocateProportionally", () => {
  it("returns empty array when weights are empty", () => {
    assert.deepEqual(allocateProportionally(100, []), []);
  });

  it("spreads remainder evenly when total or weight sum is zero/non-positive", () => {
    assert.deepEqual(allocateProportionally(0, [100, 200]), [0, 0]);
    assert.deepEqual(allocateProportionally(500, [0, 0]), [250, 250]);
    assert.deepEqual(allocateProportionally(3, [0, 0]), [2, 1]);
  });

  it("allocates total exactly across weights using largest remainder", () => {
    // 999 split across 1000_00, 2000_00, 3000_00 (ratio 1:2:3)
    const result = allocateProportionally(999, [100000, 200000, 300000]);
    assert.equal(result.reduce((a, b) => a + b, 0), 999);
    // 999 * 1/6 = 166.5 -> 166 + 1
    // 999 * 2/6 = 333.0 -> 333
    // 999 * 3/6 = 499.5 -> 499 + 1 (frac 0.5 ties resolved by order)
    assert.deepEqual(result, [167, 333, 499]);
  });

  it("handles odd remainder distribution exactly", () => {
    const result = allocateProportionally(101, [1, 1]);
    assert.equal(result.reduce((a, b) => a + b, 0), 101);
    assert.deepEqual(result, [51, 50]);
  });
});

describe("money - computeInvoice", () => {
  it("handles empty items list", () => {
    const res = computeInvoice([]);
    assert.equal(res.subtotalCents, 0);
    assert.equal(res.discountTotalCents, 0);
    assert.equal(res.taxTotalCents, 0);
    assert.equal(res.grandTotalCents, 0);
    assert.deepEqual(res.items, []);
  });

  it("computes subtotal and line items without discount or tax", () => {
    const items: CalcItemInput[] = [
      { quantity: 2, unitPriceCents: 1500, taxRatePercent: 0, taxType: "EXCLUSIVE" },
      { quantity: 3, unitPriceCents: 2000, taxRatePercent: 0, taxType: "EXCLUSIVE" },
    ];
    const res = computeInvoice(items);

    assert.equal(res.subtotalCents, 9000);
    assert.equal(res.discountTotalCents, 0);
    assert.equal(res.taxTotalCents, 0);
    assert.equal(res.grandTotalCents, 9000);

    assert.equal(res.items[0].grossCents, 3000);
    assert.equal(res.items[0].discountShareCents, 0);
    assert.equal(res.items[0].netCents, 3000);
    assert.equal(res.items[0].taxCents, 0);
    assert.equal(res.items[0].lineTotalCents, 3000);

    assert.equal(res.items[1].grossCents, 6000);
    assert.equal(res.items[1].lineTotalCents, 6000);
  });

  it("applies percentage discount correctly and allocates shares", () => {
    const items: CalcItemInput[] = [
      { quantity: 1, unitPriceCents: 6000, taxRatePercent: 0, taxType: "EXCLUSIVE" },
      { quantity: 1, unitPriceCents: 4000, taxRatePercent: 0, taxType: "EXCLUSIVE" },
    ];
    // 10% discount on 10,000 cents = 1,000 cents
    const res = computeInvoice(items, { type: "PERCENT", value: 10 });

    assert.equal(res.subtotalCents, 10000);
    assert.equal(res.discountTotalCents, 1000);
    assert.equal(res.items[0].discountShareCents, 600);
    assert.equal(res.items[0].netCents, 5400);
    assert.equal(res.items[1].discountShareCents, 400);
    assert.equal(res.items[1].netCents, 3600);
    assert.equal(res.grandTotalCents, 9000);
  });

  it("applies fixed discount and caps it at subtotal", () => {
    const items: CalcItemInput[] = [
      { quantity: 1, unitPriceCents: 5000, taxRatePercent: 0, taxType: "EXCLUSIVE" },
    ];
    const resOver = computeInvoice(items, { type: "FIXED", value: 8000 });

    assert.equal(resOver.subtotalCents, 5000);
    assert.equal(resOver.discountTotalCents, 5000);
    assert.equal(resOver.grandTotalCents, 0);

    const resNormal = computeInvoice(items, { type: "FIXED", value: 1200 });
    assert.equal(resNormal.discountTotalCents, 1200);
    assert.equal(resNormal.grandTotalCents, 3800);
  });

  it("clamps percentage discount value to [0, 100]", () => {
    const items: CalcItemInput[] = [
      { quantity: 1, unitPriceCents: 10000, taxRatePercent: 0, taxType: "EXCLUSIVE" },
    ];
    const resOver = computeInvoice(items, { type: "PERCENT", value: 150 });
    assert.equal(resOver.discountTotalCents, 10000);

    const resUnder = computeInvoice(items, { type: "PERCENT", value: -20 });
    assert.equal(resUnder.discountTotalCents, 0);
  });

  it("computes EXCLUSIVE tax correctly on net amounts", () => {
    const items: CalcItemInput[] = [
      { quantity: 1, unitPriceCents: 10000, taxRatePercent: 10, taxType: "EXCLUSIVE" },
    ];
    const res = computeInvoice(items, { type: "FIXED", value: 2000 });

    // Net = 8000 cents. Tax = 10% of 8000 = 800 cents. Line total = 8800 cents.
    assert.equal(res.subtotalCents, 10000);
    assert.equal(res.discountTotalCents, 2000);
    assert.equal(res.taxTotalCents, 800);
    assert.equal(res.grandTotalCents, 8800);
  });

  it("computes INCLUSIVE tax correctly (extracting embedded tax from net)", () => {
    const items: CalcItemInput[] = [
      { quantity: 1, unitPriceCents: 12000, taxRatePercent: 20, taxType: "INCLUSIVE" },
    ];
    const res = computeInvoice(items);

    // Net = 12000. Tax = round(12000 * 20 / 120) = 2000 cents. Line total = 12000.
    assert.equal(res.subtotalCents, 12000);
    assert.equal(res.taxTotalCents, 2000);
    assert.equal(res.grandTotalCents, 12000);
    assert.equal(res.items[0].netCents, 12000);
    assert.equal(res.items[0].lineTotalCents, 12000);
  });

  it("handles mixed tax modes (INCLUSIVE and EXCLUSIVE) in a single invoice", () => {
    const items: CalcItemInput[] = [
      { quantity: 1, unitPriceCents: 10000, taxRatePercent: 10, taxType: "EXCLUSIVE" },
      { quantity: 1, unitPriceCents: 9900, taxRatePercent: 20, taxType: "INCLUSIVE" },
    ];
    const res = computeInvoice(items, { type: "FIXED", value: 5000 });

    // Subtotal = 19900. Discount = 5000.
    // Item 1 gross = 10000, share = 2513, net = 7487. Tax (10% ex) = round(748.7) = 749. Line total = 8236.
    // Item 2 gross = 9900, share = 2487, net = 7413. Tax (20% inc) = round(7413 * 20 / 120) = 1236. Line total = 7413.
    // Tax total = 749 + 1236 = 1985. Grand total = 8236 + 7413 = 15649.
    assert.equal(res.subtotalCents, 19900);
    assert.equal(res.discountTotalCents, 5000);
    assert.equal(
      res.items.reduce((sum, item) => sum + item.discountShareCents, 0),
      5000
    );
    assert.equal(res.grandTotalCents, res.items[0].lineTotalCents + res.items[1].lineTotalCents);
  });

  it("clamps negative quantity, unitPrice, or taxRate to non-negative values", () => {
    const items: CalcItemInput[] = [
      { quantity: -5, unitPriceCents: -100, taxRatePercent: -10, taxType: "EXCLUSIVE" },
    ];
    const res = computeInvoice(items);

    assert.equal(res.subtotalCents, 0);
    assert.equal(res.taxTotalCents, 0);
    assert.equal(res.grandTotalCents, 0);
  });
});

describe("money - formatting and parsing utilities", () => {
  it("formatMoney formats cents to currency string", () => {
    const formatted = formatMoney(1234, "USD", "en-US");
    assert.ok(formatted.includes("12.34"));
  });

  it("formatMoney fallback when Intl throws", () => {
    const formatted = formatMoney(1234, "INVALID_CURRENCY", "en-US");
    assert.equal(formatted, "INVALID_CURRENCY 12.34");
  });

  it("formatMoneyBase wraps formatMoney", () => {
    assert.equal(formatMoneyBase(500, "USD", "en-US"), formatMoney(500, "USD", "en-US"));
  });

  it("trimNum formats numbers without trailing decimal zeros", () => {
    assert.equal(trimNum(10), "10");
    assert.equal(trimNum(10.5), "10.5");
    assert.equal(trimNum(10.25), "10.25");
  });

  it("formatPercent formats rate with percent sign", () => {
    assert.equal(formatPercent(15), "15%");
    assert.equal(formatPercent(8.25), "8.25%");
  });

  it("toCents converts string or number to integer cents", () => {
    assert.equal(toCents(12.34), 1234);
    assert.equal(toCents("12.34"), 1234);
    assert.equal(toCents("$1,234.50"), 123450);
    assert.equal(toCents("invalid"), 0);
  });

  it("centsToDecimalString formats cents to two-decimal string", () => {
    assert.equal(centsToDecimalString(1234), "12.34");
    assert.equal(centsToDecimalString(50), "0.50");
    assert.equal(centsToDecimalString(0), "0.00");
  });
});
