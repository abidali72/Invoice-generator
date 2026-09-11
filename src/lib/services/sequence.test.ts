import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { formatNumber } from "./sequence.ts";

describe("formatNumber", () => {
  test("formats standard invoice pattern with {YEAR} and {SEQ}", () => {
    const result = formatNumber("INV-{YEAR}-{SEQ}", 1, 2025, 4);
    assert.strictEqual(result, "INV-2025-0001");
  });

  test("handles different padding lengths correctly", () => {
    assert.strictEqual(formatNumber("INV-{YEAR}-{SEQ}", 42, 2025, 2), "INV-2025-42");
    assert.strictEqual(formatNumber("INV-{YEAR}-{SEQ}", 42, 2025, 6), "INV-2025-000042");
    assert.strictEqual(formatNumber("INV-{YEAR}-{SEQ}", 42, 2025, 0), "INV-2025-42");
  });

  test("handles sequence numbers exceeding padding length without truncating", () => {
    const result = formatNumber("INV-{YEAR}-{SEQ}", 12345, 2025, 4);
    assert.strictEqual(result, "INV-2025-12345");
  });

  test("handles sequence number zero correctly", () => {
    const result = formatNumber("INV-{YEAR}-{SEQ}", 0, 2025, 4);
    assert.strictEqual(result, "INV-2025-0000");
  });

  test("handles template with only {SEQ} placeholder", () => {
    const result = formatNumber("INV-{SEQ}", 7, 2025, 3);
    assert.strictEqual(result, "INV-007");
  });

  test("handles template with only {YEAR} placeholder", () => {
    const result = formatNumber("INV-{YEAR}", 7, 2025, 3);
    assert.strictEqual(result, "INV-2025");
  });

  test("handles static template without placeholders", () => {
    const result = formatNumber("INV-STATIC", 7, 2025, 3);
    assert.strictEqual(result, "INV-STATIC");
  });

  test("handles case sensitivity in placeholders ({year} vs {YEAR})", () => {
    const result = formatNumber("INV-{year}-{seq}", 1, 2025, 4);
    assert.strictEqual(result, "INV-{year}-{seq}");
  });

  test("handles empty template string", () => {
    const result = formatNumber("", 1, 2025, 4);
    assert.strictEqual(result, "");
  });

  test("handles special characters and symbols in prefix template", () => {
    const result = formatNumber("DOC/# {YEAR}/{SEQ}", 99, 2025, 4);
    assert.strictEqual(result, "DOC/# 2025/0099");
  });

  test("handles large sequence numbers", () => {
    const result = formatNumber("INV-{YEAR}-{SEQ}", 999999, 2025, 4);
    assert.strictEqual(result, "INV-2025-999999");
  });

  test("replaces only first occurrence of placeholder when duplicates exist", () => {
    const result = formatNumber("INV-{YEAR}-{YEAR}-{SEQ}", 1, 2025, 4);
    assert.strictEqual(result, "INV-2025-{YEAR}-0001");
  });
});
