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

    // Performance Optimization (⚡ Bolt):
    // Perform a single pass O(N) over `aging` to compute bucket totals/counts and `dueSoon`.
    // Avoids 6 separate passes and intermediate array allocations from multiple .filter() calls.
    const BUCKETS = ["NOT_DUE", "0-30", "31-60", "61-90", "90+"] as const;
    const bucketStats: Record<string, { baseCents: number; count: number }> = {
      NOT_DUE: { baseCents: 0, count: 0 },
      "0-30": { baseCents: 0, count: 0 },
      "31-60": { baseCents: 0, count: 0 },
      "61-90": { baseCents: 0, count: 0 },
      "90+": { baseCents: 0, count: 0 },
    };

    const dueSoon: typeof aging = [];
    for (const r of aging) {
      const stat = bucketStats[r.bucket];
      if (stat) {
        stat.baseCents += r.balanceBaseCents;
        stat.count += 1;
      }
      if (r.daysPastDue <= 7) {
        dueSoon.push(r);
      }
    }

    return ok({
      summary,
      buckets: BUCKETS.map((b) => ({
        bucket: b,
        baseCents: bucketStats[b]?.baseCents ?? 0,
        count: bucketStats[b]?.count ?? 0,
      })),
      revenue,
      topClients,
      exposure,
      methods,
      recent,
      dueSoon: dueSoon.slice(0, 6),
    });
  });
}
