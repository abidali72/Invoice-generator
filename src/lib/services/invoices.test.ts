import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "./invoices";

describe("ApiError", () => {
  test("instantiates with status and message correctly", () => {
    const error = new ApiError(404, "Client not found.");
    assert.equal(error.status, 404);
    assert.equal(error.message, "Client not found.");
  });

  test("inherits from Error and ApiError", () => {
    const error = new ApiError(400, "Bad Request");
    assert.ok(error instanceof Error);
    assert.ok(error instanceof ApiError);
  });

  test("supports throwing and catching with status retention", () => {
    const throwApiError = () => {
      throw new ApiError(409, "Conflict error");
    };

    assert.throws(
      () => throwApiError(),
      (err: unknown) => {
        return err instanceof ApiError && err.status === 409 && err.message === "Conflict error";
      }
    );
  });

  test("captures stack traces properly", () => {
    const error = new ApiError(500, "Internal Server Error");
    assert.ok(error.stack);
    assert.match(error.stack, /invoices\.test\.ts/);
  });
});
