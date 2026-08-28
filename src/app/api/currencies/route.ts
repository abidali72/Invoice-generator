import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok } from "@/lib/api";
import { listRates, upsertRate } from "@/lib/services/currency";

/** §12 FX table — manual rates are the configured source in this MVP. */
export async function GET() {
  return handle(async () => ok(await listRates()));
}

const schema = z.object({
  code: z.string().length(3),
  symbol: z.string().optional(),
  name: z.string().optional(),
  rateToBase: z.number().positive(),
});

export async function PUT(req: NextRequest) {
  const body = await req.json();
  return handle(async () => {
    const d = schema.parse(body);
    const row = await upsertRate(d);
    return ok(row);
  });
}
