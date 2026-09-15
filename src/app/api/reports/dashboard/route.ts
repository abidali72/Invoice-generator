import { prisma } from "@/lib/prisma";
import { handle, ok } from "@/lib/api";
import {
  getSummary,
  getAging,
  getMonthlyRevenue,
  getTopClients,
  getCurrencyExposure,
  getMethodBreakdown,
} from "@/lib/services/reports";

/** One-shot dashboard payload (KPIs + aging buckets + charts + recent). */
export async function GET() {
  return handle(async () => {
    const [summary, aging, revenue, topClients, exposure, methods, recent] = await Promise.all([
      getSummary(),
      getAging(),
      getMonthlyRevenue(),
      getTopClients(5),
      getCurrencyExposure(),
      getMethodBreakdown(),
      prisma.invoice.findMany({
        include: { client: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

    // Single-pass aggregation of total base balance and counts per aging bucket to avoid O(5N) re-filtering.
    const bucketTotals: Record<string, number> = {};
    const bucketCounts: Record<string, number> = {};
    for (const r of aging) {
      bucketTotals[r.bucket] = (bucketTotals[r.bucket] ?? 0) + r.balanceBaseCents;
      bucketCounts[r.bucket] = (bucketCounts[r.bucket] ?? 0) + 1;
    }

    return ok({
      summary,
      buckets: ["NOT_DUE", "0-30", "31-60", "61-90", "90+"].map((b) => ({
        bucket: b,
        baseCents: bucketTotals[b] ?? 0,
        count: bucketCounts[b] ?? 0,
      })),
      revenue,
      topClients,
      exposure,
      methods,
      recent,
      dueSoon: aging
        .filter((r) => r.daysPastDue <= 7)
        .slice(0, 6),
    });
  });
}
