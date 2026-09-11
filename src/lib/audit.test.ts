import test from "node:test";
import assert from "node:assert/strict";
import { diff } from "./audit";

test("diff utility function", async (t) => {
  await t.test("returns empty object when before and after are identical", () => {
    const before = { name: "Invoice #101", amountCents: 5000, active: true };
    const after = { name: "Invoice #101", amountCents: 5000, active: true };
    const result = diff(before, after);
    assert.deepStrictEqual(result, {});
  });

  await t.test("detects modified primitive properties", () => {
    const before = { status: "DRAFT", grandTotalCents: 1000 };
    const after = { status: "SENT", grandTotalCents: 1200 };
    const result = diff(before, after);
    assert.deepStrictEqual(result, {
      status: { from: "DRAFT", to: "SENT" },
      grandTotalCents: { from: 1000, to: 1200 },
    });
  });

  await t.test("detects newly added properties in after", () => {
    const before = { clientId: "c1" };
    const after = { clientId: "c1", notes: "Payment due in 30 days" };
    const result = diff(before, after);
    assert.deepStrictEqual(result, {
      notes: { from: undefined, to: "Payment due in 30 days" },
    });
  });

  await t.test("handles nested object and array differences using JSON stringification", () => {
    const before = { items: [1, 2], meta: { tags: ["tax"] } };
    const after = { items: [1, 2, 3], meta: { tags: ["tax"] } };
    const result = diff(before, after);
    assert.deepStrictEqual(result, {
      items: { from: [1, 2], to: [1, 2, 3] },
    });
  });

  await t.test("returns empty object for identical nested structures", () => {
    const before = { items: [1, 2], meta: { tags: ["tax"] } };
    const after = { items: [1, 2], meta: { tags: ["tax"] } };
    const result = diff(before, after);
    assert.deepStrictEqual(result, {});
  });

  await t.test("handles null and undefined transitions", () => {
    const before = { description: null, memo: "original" };
    const after = { description: "Updated desc", memo: null };
    const result = diff(before, after);
    assert.deepStrictEqual(result, {
      description: { from: null, to: "Updated desc" },
      memo: { from: "original", to: null },
    });
  });

  await t.test("handles empty objects for both before and after", () => {
    const before = {};
    const after = {};
    const result = diff(before, after);
    assert.deepStrictEqual(result, {});
  });

  await t.test("handles type changes for the same key", () => {
    const before = { code: 123 };
    const after = { code: "123" };
    const result = diff(before, after);
    assert.deepStrictEqual(result, {
      code: { from: 123, to: "123" },
    });
  });
});
