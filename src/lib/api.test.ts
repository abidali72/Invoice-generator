import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "./api";
import { ApiError } from "@/lib/services/invoices";
import { z } from "zod";

test("handle returns success response on normal execution", async () => {
  const res = await handle(async () => {
    return new Response(JSON.stringify({ ok: true, data: "test" }), { status: 200 });
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { ok: true, data: "test" });
});

test("handle returns ApiError message and status", async () => {
  const res = await handle(async () => {
    throw new ApiError(404, "Invoice not found");
  });
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.deepEqual(body, { ok: false, error: "Invoice not found" });
});

test("handle returns ZodError validation issues and status 400", async () => {
  const schema = z.object({ name: z.string() });
  const res = await handle(async () => {
    schema.parse({ name: 123 });
    return new Response(null);
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "Validation failed");
  assert.ok(body.issues);
});

test("handle returns generic error response for generic Error without leaking sensitive details", async () => {
  const res = await handle(async () => {
    throw new Error("Sensitive DB connection failed: postgres://user:secret_pass@localhost:5432/db");
  });
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.deepEqual(body, { ok: false, error: "Internal server error" });
  assert.equal(body.error.includes("secret_pass"), false);
});
