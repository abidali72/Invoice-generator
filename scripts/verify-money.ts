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

/* ── allocateProportionally sums exactly ── */
{
  const parts = allocateProportionally(999, [1000_00, 2000_00, 3000_00]);
  check("allocation sums to total", parts.reduce((a, b) => a + b, 0) === 999);
  const zero = allocateProportionally(500, [0, 0]);
  check("zero-weights spread evenly", zero[0] === 250 && zero[1] === 250);
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
