import { handle, ok } from "@/lib/api";
import { getAging } from "@/lib/services/reports";

/** GET /v1/reports/aging (doc §8) */
export async function GET() {
  return handle(async () => {
    const rows = await getAging();
    const totalsByBucket: Record<string, number> = {};
    for (const r of rows) totalsByBucket[r.bucket] = (totalsByBucket[r.bucket] ?? 0) + r.balanceBaseCents;
    return ok({ rows, totalsByBucket });
  });
}
