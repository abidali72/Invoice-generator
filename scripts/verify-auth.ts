import assert from "node:assert";
import { verifyAuth } from "../src/lib/auth";
import { ApiError } from "../src/lib/services/invoices";

function createMockRequest(headersObj: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/settings", {
    headers: new Headers(headersObj),
  });
}

function runTests() {
  console.log("Running authentication tests...");

  // Test 1: When no API secret is configured in process.env, verifyAuth allows request
  delete process.env.API_SECRET;
  delete process.env.APP_API_KEY;

  const req1 = createMockRequest();
  assert.doesNotThrow(() => verifyAuth(req1), "Should pass when secret is not set");

  // Test 2: When API_SECRET is set, request without auth headers fails with ApiError 401
  process.env.API_SECRET = "super-secret-key-123";

  const req2 = createMockRequest();
  assert.throws(
    () => verifyAuth(req2),
    (err: unknown) => {
      return err instanceof ApiError && err.status === 401;
    },
    "Should throw 401 ApiError when no auth header provided"
  );

  // Test 3: Request with wrong bearer token fails
  const req3 = createMockRequest({ authorization: "Bearer wrong-token" });
  assert.throws(
    () => verifyAuth(req3),
    (err: unknown) => err instanceof ApiError && err.status === 401,
    "Should throw 401 ApiError with invalid token"
  );

  // Test 4: Request with valid Bearer token succeeds
  const req4 = createMockRequest({ authorization: "Bearer super-secret-key-123" });
  assert.doesNotThrow(() => verifyAuth(req4), "Should pass with valid Bearer token");

  // Test 5: Request with valid x-api-key header succeeds
  const req5 = createMockRequest({ "x-api-key": "super-secret-key-123" });
  assert.doesNotThrow(() => verifyAuth(req5), "Should pass with valid x-api-key header");

  // Clean up env
  delete process.env.API_SECRET;

  console.log("✓ All authentication tests passed successfully.");
}

runTests();
