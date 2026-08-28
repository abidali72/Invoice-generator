import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeInvoice,
  roundCent,
  allocateProportionally,
} from "../src/lib/money.ts";
import type { CalcItemInput, DiscountInput } from "../src/lib/money.ts";

describe("roundCent", () => {
  it("rounds values to the nearest integer cent", () => {
    assert.equal(roundCent(100.4), 100);
    assert.equal(roundCent(100.5), 101);
    assert.equal(roundCent(100.6), 101);
    assert.equal(roundCent(0), 0);
  });
});

describe("allocateProportionally", () => {
  it("returns empty array for empty weights", () => {
    assert.deepEqual(allocateProportionally(100, []), []);
  });

  it("spreads evenly when wSum is 0 or total is 0", () => {
    assert.deepEqual(allocateProportionally(0, [100, 200]), [0, 0]);
    assert.deepEqual(allocateProportionally(5, [0, 0]), [3, 2]);
  });

  it("allocates exactly using largest remainder method", () => {
    const allocated = allocateProportionally(10, [100, 100, 100]);
    assert.equal(
      allocated.reduce((a, b) => a + b, 0),
      10
    );
    assert.deepEqual(allocated, [4, 3, 3]);
  });
});

describe("computeInvoice", () => {
  it("handles empty items array", () => {
    const result = computeInvoice([]);
    assert.deepEqual(result, {
      items: [],
      subtotalCents: 0,
      discountTotalCents: 0,
      taxTotalCents: 0,
      grandTotalCents: 0,
    });
  });

  it("calculates simple exclusive tax without discount", () => {
    const items: CalcItemInput[] = [
      { quantity: 2, unitPriceCents: 5000, taxRatePercent: 10, taxType: "EXCLUSIVE" },
    ];
    const result = computeInvoice(items);

    assert.equal(result.subtotalCents, 10000);
    assert.equal(result.discountTotalCents, 0);
    assert.equal(result.taxTotalCents, 1000); // 10% of 10000
    assert.equal(result.grandTotalCents, 11000);

    assert.equal(result.items.length, 1);
    assert.deepEqual(result.items[0], {
      grossCents: 10000,
      discountShareCents: 0,
      netCents: 10000,
      taxCents: 1000,
      lineTotalCents: 11000,
    });
  });

  it("calculates simple inclusive tax without discount", () => {
    const items: CalcItemInput[] = [
      { quantity: 1, unitPriceCents: 12000, taxRatePercent: 20, taxType: "INCLUSIVE" },
    ];
    const result = computeInvoice(items);

    assert.equal(result.subtotalCents, 12000);
    assert.equal(result.discountTotalCents, 0);
    assert.equal(result.taxTotalCents, 2000); // 12000 * 20 / 120 = 2000
    assert.equal(result.grandTotalCents, 12000);

    assert.deepEqual(result.items[0], {
      grossCents: 12000,
      discountShareCents: 0,
      netCents: 12000,
      taxCents: 2000,
      lineTotalCents: 12000,
    });
  });

  it("applies percentage discount across items", () => {
    const items: CalcItemInput[] = [
      { quantity: 1, unitPriceCents: 6000, taxRatePercent: 10, taxType: "EXCLUSIVE" },
      { quantity: 1, unitPriceCents: 4000, taxRatePercent: 10, taxType: "EXCLUSIVE" },
    ];
    const discount: DiscountInput = { type: "PERCENT", value: 15 }; // 15% discount
    const result = computeInvoice(items, discount);

    assert.equal(result.subtotalCents, 10000);
    assert.equal(result.discountTotalCents, 1500); // 15% of 10000
    // Item 1 gross 6000 -> discount share = 900 -> net = 5100 -> tax (10%) = 510 -> lineTotal = 5610
    // Item 2 gross 4000 -> discount share = 600 -> net = 3400 -> tax (10%) = 340 -> lineTotal = 3740
    assert.equal(result.taxTotalCents, 850);
    assert.equal(result.grandTotalCents, 9350);

    assert.equal(result.items[0].discountShareCents, 900);
    assert.equal(result.items[1].discountShareCents, 600);
  });

  it("applies fixed discount capped at subtotal", () => {
    const items: CalcItemInput[] = [
      { quantity: 1, unitPriceCents: 3000, taxRatePercent: 0, taxType: "EXCLUSIVE" },
    ];
    const discount: DiscountInput = { type: "FIXED", value: 5000 }; // $50.00 discount on $30.00 item
    const result = computeInvoice(items, discount);

    assert.equal(result.subtotalCents, 3000);
    assert.equal(result.discountTotalCents, 3000); // capped at subtotal
    assert.equal(result.grandTotalCents, 0);
  });

  it("handles negative discount value and clamps percentage", () => {
    const items: CalcItemInput[] = [
      { quantity: 1, unitPriceCents: 10000, taxRatePercent: 0, taxType: "EXCLUSIVE" },
    ];

    const negPercent = computeInvoice(items, { type: "PERCENT", value: -20 });
    assert.equal(negPercent.discountTotalCents, 0);

    const overPercent = computeInvoice(items, { type: "PERCENT", value: 150 });
    assert.equal(overPercent.discountTotalCents, 10000);

    const negFixed = computeInvoice(items, { type: "FIXED", value: -500 });
    assert.equal(negFixed.discountTotalCents, 0);
  });

  it("handles negative quantities and prices by clamping to 0", () => {
    const items: CalcItemInput[] = [
      { quantity: -5, unitPriceCents: -1000, taxRatePercent: 10, taxType: "EXCLUSIVE" },
    ];
    const result = computeInvoice(items);

    assert.equal(result.subtotalCents, 0);
    assert.equal(result.grandTotalCents, 0);
  });

  it("handles fractional quantities and rounds gross cents", () => {
    const items: CalcItemInput[] = [
      { quantity: 1.5, unitPriceCents: 3333, taxRatePercent: 0, taxType: "EXCLUSIVE" }, // 4999.5 -> 5000
    ];
    const result = computeInvoice(items);

    assert.equal(result.subtotalCents, 5000);
    assert.equal(result.items[0].grossCents, 5000);
  });

  it("handles mixed INCLUSIVE and EXCLUSIVE tax lines in a single invoice", () => {
    const items: CalcItemInput[] = [
      { quantity: 1, unitPriceCents: 11000, taxRatePercent: 10, taxType: "INCLUSIVE" }, // gross = 11000, tax = 1000, lineTotal = 11000
      { quantity: 1, unitPriceCents: 10000, taxRatePercent: 10, taxType: "EXCLUSIVE" }, // gross = 10000, tax = 1000, lineTotal = 11000
    ];
    const result = computeInvoice(items, null);

    assert.equal(result.subtotalCents, 21000);
    assert.equal(result.taxTotalCents, 2000);
    assert.equal(result.grandTotalCents, 22000); // 11000 + 11000
  });

  it("handles null / undefined discount values gracefully", () => {
    const items: CalcItemInput[] = [
      { quantity: 1, unitPriceCents: 5000, taxRatePercent: 0, taxType: "EXCLUSIVE" },
    ];

    const nullVal = computeInvoice(items, { type: "PERCENT", value: null });
    assert.equal(nullVal.discountTotalCents, 0);

    const undefVal = computeInvoice(items, { type: "FIXED", value: undefined });
    assert.equal(undefVal.discountTotalCents, 0);

    const nullType = computeInvoice(items, { type: null, value: 500 });
    assert.equal(nullType.discountTotalCents, 0);
  });
});
