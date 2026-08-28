import test from "node:test";
import assert from "node:assert";
import { z, ZodError } from "zod";
import { readJson, ok, handle } from "./api";
import { ApiError } from "@/lib/services/invoices";

test("readJson parses valid JSON request body", async () => {
  const req = new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Invoice", amount: 100 }),
  });

  const result = await readJson<{ name: string; amount: number }>(req);
  assert.strictEqual(result.name, "Invoice");
  assert.strictEqual(result.amount, 100);
});

test("readJson throws ApiError 400 when request body is malformed JSON string", async () => {
  const req = new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{ invalid json ",
  });

  await assert.rejects(
    async () => {
      await readJson(req);
    },
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.strictEqual((err as ApiError).status, 400);
      assert.strictEqual((err as ApiError).message, "Request body is not valid JSON.");
      return true;
    }
  );
});

test("readJson throws ApiError 400 when req.json() method throws an error", async () => {
  const mockReq = {
    json: async () => {
      throw new Error("Stream read error");
    },
  } as unknown as Request;

  await assert.rejects(
    async () => {
      await readJson(mockReq);
    },
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.strictEqual((err as ApiError).status, 400);
      assert.strictEqual((err as ApiError).message, "Request body is not valid JSON.");
      return true;
    }
  );
});

test("readJson throws ApiError 400 when request body is empty", async () => {
  const req = new Request("http://localhost", {
    method: "POST",
  });

  await assert.rejects(
    async () => {
      await readJson(req);
    },
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.strictEqual((err as ApiError).status, 400);
      assert.strictEqual((err as ApiError).message, "Request body is not valid JSON.");
      return true;
    }
  );
});

test("ok returns a NextResponse with default status 200 and data envelope", async () => {
  const response = ok({ id: "123", status: "DRAFT" });
  assert.strictEqual(response.status, 200);

  const json = await response.json();
  assert.deepStrictEqual(json, {
    ok: true,
    data: { id: "123", status: "DRAFT" },
  });
});

test("ok returns a NextResponse with custom status code", async () => {
  const response = ok({ id: "123" }, 201);
  assert.strictEqual(response.status, 201);

  const json = await response.json();
  assert.deepStrictEqual(json, {
    ok: true,
    data: { id: "123" },
  });
});

test("handle returns the successful Response when fn succeeds", async () => {
  const response = await handle(async () => {
    return ok({ message: "Success" });
  });

  assert.strictEqual(response.status, 200);
  const json = await response.json();
  assert.deepStrictEqual(json, { ok: true, data: { message: "Success" } });
});

test("handle catches ApiError and returns JSON response with status and message", async () => {
  const response = await handle(async () => {
    throw new ApiError(404, "Client not found.");
  });

  assert.strictEqual(response.status, 404);
  const json = await response.json();
  assert.deepStrictEqual(json, { ok: false, error: "Client not found." });
});

test("handle catches ZodError and returns 400 status with flattened issues", async () => {
  const schema = z.object({ title: z.string() });
  const parseResult = schema.safeParse({ title: 123 });
  assert.strictEqual(parseResult.success, false);

  const response = await handle(async () => {
    throw parseResult.error;
  });

  assert.strictEqual(response.status, 400);
  const json = await response.json();
  assert.strictEqual(json.ok, false);
  assert.strictEqual(json.error, "Validation failed");
  assert.ok(json.issues);
});

test("handle catches generic Error and returns 500 status", async () => {
  const response = await handle(async () => {
    throw new Error("Unexpected database connection error");
  });

  assert.strictEqual(response.status, 500);
  const json = await response.json();
  assert.deepStrictEqual(json, {
    ok: false,
    error: "Unexpected database connection error",
  });
});

test("handle catches non-Error throwables and returns 500 Internal error", async () => {
  const response = await handle(async () => {
    throw "Fatal unexpected error string";
  });

  assert.strictEqual(response.status, 500);
  const json = await response.json();
  assert.deepStrictEqual(json, {
    ok: false,
    error: "Internal error",
  });
});
