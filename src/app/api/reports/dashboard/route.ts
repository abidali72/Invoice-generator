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
      // Bolt optimization: Select only required fields for recent invoices list
      prisma.invoice.findMany({
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          grandTotalCents: true,
          currency: true,
          dueDate: true,
          client: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

    // Bolt optimization: Single-pass aggregation for bucket baseCents and counts
    const BUCKETS = ["NOT_DUE", "0-30", "31-60", "61-90", "90+"] as const;
    const bucketMap: Record<string, { baseCents: number; count: number }> = {
      NOT_DUE: { baseCents: 0, count: 0 },
      "0-30": { baseCents: 0, count: 0 },
      "31-60": { baseCents: 0, count: 0 },
      "61-90": { baseCents: 0, count: 0 },
      "90+": { baseCents: 0, count: 0 },
    };

    for (const r of aging) {
      const entry = bucketMap[r.bucket];
      if (entry) {
        entry.baseCents += r.balanceBaseCents;
        entry.count += 1;
      }
    }

    return ok({
      summary,
      buckets: BUCKETS.map((b) => ({
        bucket: b,
        baseCents: bucketMap[b].baseCents,
        count: bucketMap[b].count,
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
