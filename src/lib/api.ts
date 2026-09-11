import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "@/lib/services/invoices";

export type Ctx = { params: Promise<Record<string, string>> };

/** Success envelope */
export function ok(data: unknown, init?: number) {
  return NextResponse.json({ ok: true, data }, { status: init ?? 200 });
}

/** Parse request JSON into a typed value; malformed bodies are a client error. */
export async function readJson<T = unknown>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, "Request body is not valid JSON.");
  }
}

/**
 * Wraps a handler with uniform error mapping (doc §8 style errors):
 * ApiError → status, ZodError → 400 with issues, everything else → 500.
 */
export async function handle<T>(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    if (err instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: "Validation failed", issues: err.flatten() },
        { status: 400 }
      );
    }
    console.error("[api]", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
