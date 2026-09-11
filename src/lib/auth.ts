import crypto from "crypto";
import { ApiError } from "@/lib/services/invoices";

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifies API authentication for incoming requests.
 * Checks for Authorization header ("Bearer <token>") or "x-api-key" header.
 * Secret key is configured via process.env.API_SECRET or process.env.APP_API_KEY.
 * If secret is configured and token is missing or invalid, throws ApiError(401, "Unauthorized").
 */
export function verifyAuth(req: Request): void {
  const secret = process.env.API_SECRET || process.env.APP_API_KEY;

  if (!secret) {
    // If no secret key is configured in environment, pass through.
    return;
  }

  const authHeader = req.headers.get("authorization");
  const apiKeyHeader = req.headers.get("x-api-key");

  let token: string | null = null;
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.substring(7).trim();
  } else if (apiKeyHeader) {
    token = apiKeyHeader.trim();
  }

  if (!token || !safeCompare(token, secret)) {
    throw new ApiError(401, "Unauthorized: Invalid or missing API authentication credential.");
  }
}
