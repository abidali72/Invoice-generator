/**
 * Financial integrity test for src/lib/money.ts (doc §19).
 * Runs on bare Node 24 (native TS type-stripping):
 *   node scripts/verify-money.ts
 * Verifies the invariants that must hold for EVERY invoice:
 *   I1 Σ(item.discountShare) === discountTotal
 *   I2 EXCLUSIVE: grand === subtotal − discount + tax ; line totals sum to grand
 *   I3 INCLUSIVE: grand === Σ(net);  tax ≤ net per line
 *   I4 mixed-mode invoices reconcile by construction
 */
import { computeInvoice, allocateProportionally } from "../src/lib/money.ts";

let failures = 0;
function check(name: string, cond: boolean) {
  if (!cond) {
    failures += 1;
    console.error(`  ✗ ${name}`);
  }
}

/* ── allocateProportionally edge cases and invariants ── */
{
  // 1. Empty weights
  const empty = allocateProportionally(100, []);
  check("allocateProportionally: empty weights returns empty array", empty.length === 0);

  // 2. Zero total
  const zeroTotal = allocateProportionally(0, [10, 20, 30]);
  check(
    "allocateProportionally: zero total returns all zeros",
    zeroTotal.length === 3 && zeroTotal.every((x) => x === 0)
  );

  // 3. Zero total with zero weights
  const zeroBoth = allocateProportionally(0, [0, 0]);
  check(
    "allocateProportionally: zero total with zero weights returns all zeros",
    zeroBoth.length === 2 && zeroBoth.every((x) => x === 0)
  );

  // 4. Zero/Negative weight sum with total > 0 (even distribution with remainder)
  const zeroWeightsEven = allocateProportionally(500, [0, 0]);
  check(
    "allocateProportionally: zero weights spread evenly",
    zeroWeightsEven[0] === 250 && zeroWeightsEven[1] === 250
  );

  const zeroWeightsRemainder = allocateProportionally(5, [0, 0]);
  check(
    "allocateProportionally: zero weights spread evenly with remainder",
    zeroWeightsRemainder.reduce((a, b) => a + b, 0) === 5 &&
      zeroWeightsRemainder[0] === 3 &&
      zeroWeightsRemainder[1] === 2
  );

  const negWeights = allocateProportionally(100, [-10, -20]);
  check(
    "allocateProportionally: non-positive weight sum spreads total evenly",
    negWeights.reduce((a, b) => a + b, 0) === 100 &&
      negWeights[0] === 50 &&
      negWeights[1] === 50
  );

  // 5. Single weight
  const single = allocateProportionally(1234, [50]);
  check(
    "allocateProportionally: single weight receives full total",
    single.length === 1 && single[0] === 1234
  );

  // 6. Proportional distribution and remainder allocation
  const parts = allocateProportionally(999, [1000_00, 2000_00, 3000_00]);
  check(
    "allocateProportionally: allocation sums to total",
    parts.reduce((a, b) => a + b, 0) === 999
  );
  check(
    "allocateProportionally: proportional split values",
    parts[0] === 167 && parts[1] === 333 && parts[2] === 499
  );

  // 7. Largest-remainder tie-breaking order (when fractional remainders are equal, earlier index gets remainder)
  const tieBreak = allocateProportionally(1, [1, 1, 1]);
  check(
    "allocateProportionally: tie-break gives remainder to first item in index order",
    tieBreak[0] === 1 && tieBreak[1] === 0 && tieBreak[2] === 0
  );

  const tieBreak2 = allocateProportionally(2, [10, 10, 10]);
  check(
    "allocateProportionally: tie-break gives remainders to earliest indices",
    tieBreak2[0] === 1 && tieBreak2[1] === 1 && tieBreak2[2] === 0
  );

  // 8. Remainder distribution based on largest fractional part
  // total = 10, weights = [1, 2, 3], wSum = 6
  // raw = [10/6, 20/6, 30/6] = [1.6666..., 3.3333..., 5.0]
  // floors = [1, 3, 5], sum = 9, remainder = 1
  // fracs = [0.6666..., 0.3333..., 0.0] -> index 0 has largest frac, receives +1 -> [2, 3, 5]
  const fracOrder = allocateProportionally(10, [1, 2, 3]);
  check(
    "allocateProportionally: largest fractional part receives remainder",
    fracOrder[0] === 2 && fracOrder[1] === 3 && fracOrder[2] === 5
  );

  // 9. Large numbers accuracy
  const largeAlloc = allocateProportionally(10_000_000, [3, 7]);
  check(
    "allocateProportionally: large totals allocated correctly",
    largeAlloc[0] === 3_000_000 &&
      largeAlloc[1] === 7_000_000 &&
      largeAlloc.reduce((a, b) => a + b, 0) === 10_000_000
  );
}

/* ── doc §20 sample invoice shape (exclusive 8%) ── */
{
  const calc = computeInvoice(
    [
      { quantity: 1, unitPriceCents: 250000, taxRatePercent: 8, taxType: "EXCLUSIVE" },
      { quantity: 1, unitPriceCents: 400000, taxRatePercent: 8, taxType: "EXCLUSIVE" },
    ],
    { type: null, value: null }
  );
  const shareSum = calc.items.reduce((a, b) => a + b.discountShareCents, 0);
  const grandSum = calc.items.reduce((a, b) => a + b.lineTotalCents, 0);
  check("I1 zero discount allocates nothing", shareSum === 0);
  check("I2 sample: tax = 520.00", calc.taxTotalCents === 52000);
  check("I2 sample: grand = 7020.00", calc.grandTotalCents === 702000);
  check("I2 Σ lineTotal == grand", grandSum === calc.grandTotalCents);
}

/* ── percentage discount across three lines (remainder distribution) ── */
{
  const calc = computeInvoice(
    [
      { quantity: 3, unitPriceCents: 13330, taxRatePercent: 20, taxType: "EXCLUSIVE" },
      { quantity: 1, unitPriceCents: 95007, taxRatePercent: 20, taxType: "EXCLUSIVE" },
      { quantity: 7, unitPriceCents: 1501, taxRatePercent: 20, taxType: "EXCLUSIVE" },
    ],
    { type: "PERCENT", value: 12.5 }
  );
  const shareSum = calc.items.reduce((a, b) => a + b.discountShareCents, 0);
  const grossSum = calc.items.reduce((a, b) => a + b.grossCents, 0);
  const grandSum = calc.items.reduce((a, b) => a + b.lineTotalCents, 0);
  check("I1 discount shares sum exactly", shareSum === calc.discountTotalCents);
  check(
    "I2 grand == subtotal − discount + tax",
    grandSum === grossSum - calc.discountTotalCents + calc.taxTotalCents
  );
  // every item's own arithmetic closes too
  const itemsClose = calc.items.every(
    (it) => it.netCents === it.grossCents - it.discountShareCents && it.lineTotalCents === it.netCents + it.taxCents
  );
  check("I2 per-item closure", itemsClose);
}

/* ── inclusive VAT mode ── */
{
  const calc = computeInvoice(
    [{ quantity: 1, unitPriceCents: 120000, taxRatePercent: 20, taxType: "INCLUSIVE" }],
    null
  );
  check("I3 inclusive grand stays at list price", calc.grandTotalCents === 120000);
  check("I3 extracted VAT is 20/120", calc.taxTotalCents === 20000);
  check("I3 net ⊂ grand", calc.grandTotalCents - calc.taxTotalCents === 100000);
}

/* ── fixed discount capped at subtotal; odd cents split evenly ── */
{
  const calc = computeInvoice(
    [{ quantity: 0.5, unitPriceCents: 3303, taxRatePercent: 0, taxType: "EXCLUSIVE" }],
    { type: "FIXED", value: 10000 }
  );
  check("subtotal is rounded qty×price", calc.subtotalCents === 1652);
  check("discount capped at subtotal", calc.discountTotalCents === 1652);
  check("fully discounted grand totals to zero", calc.grandTotalCents === 0);
  const odd = allocateProportionally(101, [1, 1]);
  check("odd remainder distributed exactly (sum)", odd[0] + odd[1] === 101 && Math.abs(odd[0] - odd[1]) <= 1);
}

/* ── mixed modes in one invoice (§3.4 multi-tax stacking freedom) ── */
{
  const calc = computeInvoice(
    [
      { quantity: 1, unitPriceCents: 100000, taxRatePercent: 10, taxType: "EXCLUSIVE" },
      { quantity: 1, unitPriceCents: 99000, taxRatePercent: 20, taxType: "INCLUSIVE" },
    ],
    { type: "FIXED", value: 5000 }
  );
  const grandSum = calc.items.reduce((a, b) => a + b.lineTotalCents, 0);
  check("I4 mixed-mode grand == Σ line totals", grandSum === calc.grandTotalCents);
  check("I4 shares still exact", calc.items.reduce((a, b) => a + b.discountShareCents, 0) === 5000);
}

if (failures > 0) {
  console.error(`\nFAILURES: ${failures}`);
  process.exit(1);
}
console.log("✓ all monetary invariants hold");
